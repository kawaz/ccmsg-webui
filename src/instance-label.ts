import type { Endpoint, InstanceId } from "@ccmsg/protocol";

/** How many characters of an id stand for the whole of it on screen.
 *
 * An id is thirty-two hex characters that no one reads as a name. Eight is
 * enough to tell apart the handful of instances one person runs, and short
 * enough to sit in a line beside the things that are actually about to be
 * read. */
const SHORT_ID_LENGTH = 8;

/** What to call an instance in front of a person.
 *
 * The id names the instance and the endpoint says where it answers, and it is
 * the endpoint a person recognises — it is the URL they configured, or the one
 * they proxy. So the endpoint is shown where there is one, and the id is what
 * is left when there is not: an instance in no mesh has no URL to give, and is
 * still an instance that has to be named.
 *
 * Nothing here is an identity. Two instances behind one alias show the same
 * endpoint, and what tells them apart is the id this shortens. */
export function instanceLabel(instance: InstanceId, endpoint?: Endpoint): string {
  return endpoint ?? instance.slice(0, SHORT_ID_LENGTH);
}
