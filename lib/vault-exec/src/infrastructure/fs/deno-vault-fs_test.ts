import { assertEquals } from "jsr:@std/assert";
import { DenoVaultReader } from "./deno-vault-fs.ts";

Deno.test(
  "DenoVaultReader.listNotes - recursive and skips technical folders",
  async () => {
    const root = await Deno.makeTempDir({ prefix: "vx-io-" });
    try {
      await Deno.mkdir(`${root}/A/B`, { recursive: true });
      await Deno.mkdir(`${root}/.obsidian`, { recursive: true });
      await Deno.mkdir(`${root}/.vault-exec`, { recursive: true });
      await Deno.mkdir(`${root}/_drafts`, { recursive: true });

      await Deno.writeTextFile(`${root}/Root.md`, "# root");
      await Deno.writeTextFile(`${root}/A/Child.md`, "# child");
      await Deno.writeTextFile(`${root}/A/B/Leaf.MD`, "# leaf");
      await Deno.writeTextFile(`${root}/A/ignore.txt`, "x");
      await Deno.writeTextFile(`${root}/.obsidian/Hidden.md`, "# hidden");
      await Deno.writeTextFile(`${root}/.vault-exec/Store.md`, "# store");
      await Deno.writeTextFile(`${root}/_drafts/Draft.md`, "# draft");

      const reader = new DenoVaultReader();
      const notes = await reader.listNotes(root);

      assertEquals(notes, [
        `${root}/A/B/Leaf.MD`,
        `${root}/A/Child.md`,
        `${root}/Root.md`,
      ]);
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
);
