import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const transcript = join(
  process.env.USERPROFILE ?? "",
  ".cursor/projects/c-Users-parbh-OneDrive-Desktop-projects-custom-light-weight-test/agent-transcripts/64076507-22bf-4621-912e-790aae272761/64076507-22bf-4621-912e-790aae272761.jsonl",
);

const lines = readFileSync(transcript, "utf8").split("\n");
const line = lines.find((l) => l.includes("1781521740"));
if (!line) throw new Error("user payload line not found");

const obj = JSON.parse(line);
const text = obj.message?.content?.[0]?.text ?? "";
const start = text.indexOf('{\n    "s": "ok"');
const end = text.lastIndexOf("}") + 1;
const json = JSON.parse(text.slice(start, end));
writeFileSync(
  join(__dirname, "pearson-user.json"),
  JSON.stringify({ t: json.t, o: json.o, h: json.h, l: json.l, c: json.c }),
);
console.log("saved", json.t.length, "bars");
