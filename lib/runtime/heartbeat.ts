let lastRun = new Date().toISOString();
let lastJournalWrite = new Date().toISOString();

export function setHeartbeat() {
  lastRun = new Date().toISOString();
}

export function getHeartbeat() {
  return lastRun;
}

export function setJournalHeartbeat() {
  lastJournalWrite = new Date().toISOString();
  if (new Date(lastJournalWrite).getTime() > new Date(lastRun).getTime()) {
    lastRun = lastJournalWrite;
  }
}

export function getJournalHeartbeat() {
  return lastJournalWrite;
}
