import type {
  ActivitySample,
  ActivitySession,
} from "@/lib/dashboard/types"

const MAX_SESSION_GAP_MS = 90_000
const SAMPLE_DURATION_MS = 60_000

function sampleEndAt(sample: ActivitySample) {
  return (
    sample.endedAt ??
    formatLikeSample(
      new Date(new Date(sample.sampledAt).getTime() + SAMPLE_DURATION_MS),
      sample.sampledAt
    )
  )
}

function durationMinutes(sample: ActivitySample) {
  return (
    (new Date(sampleEndAt(sample)).getTime() -
      new Date(sample.sampledAt).getTime()) /
    SAMPLE_DURATION_MS
  )
}

function toSession(sample: ActivitySample): ActivitySession {
  return {
    startAt: sample.sampledAt,
    endAt: sampleEndAt(sample),
    appClass: sample.appClass,
    windowTitle: sample.windowTitle,
    durationMinutes: durationMinutes(sample),
    sampleCount: 1,
  }
}

function formatLikeSample(date: Date, sample: string) {
  const offset = sample.slice(-6)
  const offsetSign = offset[0] === "-" ? -1 : 1
  const offsetMinutes =
    offsetSign *
    (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)))
  const local = new Date(date.getTime() + offsetMinutes * 60_000)

  return `${local.toISOString().slice(0, 19)}${offset}`
}

export function groupSessions(samples: ActivitySample[]): ActivitySession[] {
  const ordered = samples.toSorted(
    (left, right) =>
      new Date(left.sampledAt).getTime() - new Date(right.sampledAt).getTime()
  )
  const sessions: ActivitySession[] = []
  let previousSample: ActivitySample | undefined

  for (const sample of ordered) {
    const currentSession = sessions.at(-1)
    const gap = previousSample
      ? new Date(sample.sampledAt).getTime() -
        new Date(
          previousSample.endedAt
            ? sampleEndAt(previousSample)
            : previousSample.sampledAt
        ).getTime()
      : Number.POSITIVE_INFINITY
    const isContinuation =
      currentSession &&
      previousSample &&
      gap <= MAX_SESSION_GAP_MS &&
      currentSession.appClass === sample.appClass &&
      currentSession.windowTitle === sample.windowTitle

    if (!isContinuation) {
      sessions.push(toSession(sample))
      previousSample = sample
      continue
    }

    currentSession.sampleCount += 1
    currentSession.durationMinutes += durationMinutes(sample)
    const nextEndAt = sampleEndAt(sample)
    if (
      new Date(nextEndAt).getTime() >
      new Date(currentSession.endAt).getTime()
    ) {
      currentSession.endAt = nextEndAt
    }
    previousSample = sample
  }

  return sessions
}
