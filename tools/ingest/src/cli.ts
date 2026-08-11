import { ingest } from "@rag/core";
import { loadRootEnv, resolveFromRepoRoot } from "@rag/db";

loadRootEnv();

interface Args {
  corpusDir: string;
  watch: boolean;
  force: boolean;
}

const parseArgs = (argv: string[]): Args => {
  const dirFlag = argv.indexOf("--dir");
  return {
    // Anchored to the repo root, not the CLI's own directory: CORPUS_DIR in
    // .env is written relative to the repository.
    corpusDir: resolveFromRepoRoot(
      dirFlag !== -1 ? (argv[dirFlag + 1] ?? "") : (process.env.CORPUS_DIR ?? "./data/corpus"),
    ),
    watch: argv.includes("--watch"),
    force: argv.includes("--force"),
  };
};

const args = parseArgs(process.argv.slice(2));

const runOnce = async (trigger: "cli" | "watch"): Promise<void> => {
  const started = Date.now();
  const result = await ingest({
    corpusDir: args.corpusDir,
    trigger,
    force: args.force,
    onProgress: (message) => console.info(message),
  });

  const { added, updated, unchanged, removed, failed } = result.counts;
  console.info(
    `\nadded ${added}  updated ${updated}  unchanged ${unchanged}  ` +
      `removed ${removed}  failed ${failed}   (${Date.now() - started} ms)`,
  );

  if (result.failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of result.failures) {
      console.error(`  ${failure.path}: ${failure.error}`);
    }
  }
};

const main = async (): Promise<void> => {
  console.info(
    `Corpus: ${args.corpusDir}${args.force ? "  (force: re-embedding everything)" : ""}`,
  );

  await runOnce(args.watch ? "watch" : "cli");

  if (!args.watch) {
    process.exit(0);
  }

  // Watch mode keeps the index current while the corpus is edited. Because the
  // pipeline diffs on content hash, a re-run after one edit re-embeds one
  // document, not the whole corpus.
  const { watch } = await import("chokidar");
  console.info(`\nWatching ${args.corpusDir} for changes. Ctrl+C to stop.`);

  let timer: NodeJS.Timeout | undefined;
  let running = false;
  let queued = false;

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    // Debounced: an editor save can emit several events, and a bulk copy emits
    // one per file. One pass after things settle is enough.
    timer = setTimeout(() => {
      void trigger();
    }, 500);
  };

  const trigger = async (): Promise<void> => {
    if (running) {
      queued = true;
      return;
    }
    running = true;
    try {
      await runOnce("watch");
    } catch (error) {
      console.error("Ingestion failed:", error);
    } finally {
      running = false;
      if (queued) {
        queued = false;
        schedule();
      }
    }
  };

  watch(args.corpusDir, { ignoreInitial: true })
    .on("add", schedule)
    .on("change", schedule)
    .on("unlink", schedule);
};

main().catch((error: unknown) => {
  console.error("Ingestion failed:", error);
  process.exit(1);
});
