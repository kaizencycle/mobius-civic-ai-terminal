let lastRun = new Date().toISOString();

export function setHeartbeat() {
  lastRun = new Date().toISOString();
}

export function getHeartbeat() {
  return lastRun;
}
