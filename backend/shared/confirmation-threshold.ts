/**
 * Threshold and helper for promoting an incident to `resolved`.
 *
 * A single `no_longer_exists` vote is no longer enough to hide an
 * incident from the public map. The incident must accumulate enough
 * confirming votes from enough distinct devices that two requests
 * from the same client (one vote + one confirmation) cannot flip the
 * status on its own.
 *
 * The vote count excludes `worsened`, since `worsened` means "still
 * there, but worse" — it does not affirm that the incident exists.
 */
export const RESOLVE_THRESHOLD_CONFIRMATIONS = 3;
export const RESOLVE_THRESHOLD_DISTINCT_DEVICES = 2;

const NON_AFFIRMING_ACTIONS = new Set(['worsened']);

/**
 * Returns true iff the cumulative vote tally should flip the
 * incident's status to `resolved`. The caller is responsible for the
 * atomic `UpdateCommand` with a `ConditionExpression` so concurrent
 * flips stay idempotent.
 *
 * The vote count (`affirmingCount`) excludes `worsened`, because
 * `worsened` means "still there, but worse" — it does not in itself
 * affirm that the incident exists. Two `worsened` votes from the
 * same device could otherwise be used to bury a real incident
 * without ever confirming it.
 *
 * The distinct-device count (`distinctDevices`) INCLUDES worsening
 * votes, because a `worsened` vote is itself a confirmation that
 * the incident exists (just at a different severity).
 *
 * @param rows - every confirmation row for the incident, including
 *               `action` and `deviceId`. May include any action.
 * @param nowSec - current epoch seconds (unused, kept for future
 *                time-windowed thresholds; signature stable).
 */
export function shouldResolve(
  rows: ReadonlyArray<{ deviceId: string; action: string }>,
  nowSec: number = Math.floor(Date.now() / 1000),
): boolean {
  void nowSec;
  const distinctDevices = new Set<string>();
  let affirmingCount = 0;
  for (const r of rows) {
    distinctDevices.add(r.deviceId);
    if (NON_AFFIRMING_ACTIONS.has(r.action)) continue;
    affirmingCount++;
  }
  return (
    affirmingCount >= RESOLVE_THRESHOLD_CONFIRMATIONS &&
    distinctDevices.size >= RESOLVE_THRESHOLD_DISTINCT_DEVICES
  );
}

/**
 * Counts the same shape `shouldResolve` evaluates, returned for
 * observability (logging and audit). The caller can surface these
 * counts in the response so partners / clients know how close they
 * are to flipping the status.
 *
 * `distinctDevices` here counts every device that has voted any
 * action — matching `shouldResolve`'s semantics above.
 */
export function tallyVotes(
  rows: ReadonlyArray<{ deviceId: string; action: string }>,
): { affirming: number; worsening: number; distinctDevices: number } {
  let affirming = 0;
  let worsening = 0;
  const devices = new Set<string>();
  for (const r of rows) {
    devices.add(r.deviceId);
    if (NON_AFFIRMING_ACTIONS.has(r.action)) {
      worsening++;
    } else {
      affirming++;
    }
  }
  return { affirming, worsening, distinctDevices: devices.size };
}