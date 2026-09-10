import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";

/** A session, as far as the instance is concerned.
 *
 * The screens under test are the ones a person reads while sessions are
 * running, and what makes a session running is a connection greeting as one.
 * Nothing here runs a harness: a real Claude Code process would put a pid, a
 * clock and a machine's own paths on screen, and none of those can be compared
 * against a baseline. What this greets with is written down instead. */
export interface FakeSession {
  close(): void;
}

/** The version this greeting speaks, read out of the contract package rather
 * than written here.
 *
 * Read rather than imported because the runner is node and the contract ships
 * TypeScript source, which node will not strip under `node_modules`. A number
 * copied into this file would be a second place the contract's version is
 * written down, and a stale copy is refused outright by the greeting it is
 * sent in, which is where it would be found. */
function protocolVersion(): number {
  const source = readFileSync(
    join(dirname(createRequire(import.meta.url).resolve("@ccmsg/protocol")), "envelope.ts"),
    "utf8",
  );
  const said = /export const PROTOCOL_VERSION = (\d+)/.exec(source);
  if (said === null) throw new Error("契約の PROTOCOL_VERSION が読めません");
  return Number(said[1]);
}

/** The socket the instance is answering on.
 *
 * Beside the state directory, which is this run's own and short enough that the
 * daemon keeps the socket there rather than in its fallback under `/tmp` (that
 * one is for a state directory nested too deep for `sun_path`). Absent means
 * something else about the run is wrong, so it is said rather than guessed at. */
function socketIn(stateDir: string): string {
  const socket = join(stateDir, "daemon.sock");
  if (!existsSync(socket)) throw new Error(`${socket} がありません`);
  return socket;
}

export interface SessionFacts {
  readonly sid: string;
  readonly cwd: string;
  readonly transcriptPath: string;
  readonly title: string;
  readonly repo: string;
  readonly branch: string;
  readonly model: string;
}

export function greetAsSession(stateDir: string, facts: SessionFacts): Promise<FakeSession> {
  return new Promise((resolve, reject) => {
    const conn = connect(socketIn(stateDir));
    conn.once("error", reject);
    const lines = createInterface({ input: conn });
    lines.on("line", (line) => {
      if (line.trim() === "") return;
      const frame = JSON.parse(line) as { request_id?: unknown; ok?: unknown };
      if (frame.request_id !== "hello") return;
      if (frame.ok === true) {
        resolve({
          close: () => {
            conn.end();
          },
        });
      } else reject(new Error(`session の hello が断られました: ${line}`));
    });
    conn.write(
      `${JSON.stringify({
        op: "hello",
        request_id: "hello",
        role: "session",
        protocol_version: protocolVersion(),
        sid: facts.sid,
        cwd: facts.cwd,
        transcript_path: facts.transcriptPath,
        repo: facts.repo,
        repo_root: facts.cwd,
        ws: "main",
        branch: facts.branch,
        title: facts.title,
        model: facts.model,
        effort: "high",
      })}\n`,
    );
  });
}
