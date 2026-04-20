import "reflect-metadata";
import { AppDataSource } from "./data-source.js";

const revert = process.argv.includes("revert");

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    if (revert) {
      await AppDataSource.undoLastMigration();
      console.log("Reverted last migration.");
    } else {
      await AppDataSource.runMigrations();
      console.log("Migrations finished.");
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
