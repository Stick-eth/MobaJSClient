export const TEAM_BLUE = 'blue';
export const TEAM_RED = 'red';
export const TEAMS = [TEAM_BLUE, TEAM_RED];

let myTeam = null;
const playerTeams = new Map();

function normalizeTeam(team) {
  if (typeof team !== 'string') return null;
  const lower = team.toLowerCase();
  if (lower === TEAM_BLUE || lower === TEAM_RED) {
    return lower;
  }
  return null;
}

export function setMyTeam(team) {
  const normalized = normalizeTeam(team);
  if (normalized === myTeam) return normalized;
  myTeam = normalized;
  if (normalized) {
    playerTeams.set('self', normalized);
  } else {
    playerTeams.delete('self');
  }
  window.dispatchEvent(new CustomEvent('teamChanged', { detail: { team: myTeam } }));
  return myTeam;
}

export function getMyTeam() {
  return myTeam;
}

export function setPlayerTeam(id, team) {
  if (!id) return null;
  const normalized = normalizeTeam(team);
  const previous = playerTeams.get(id) ?? null;
  if (normalized) {
    if (previous === normalized) return normalized;
    playerTeams.set(id, normalized);
  } else if (previous !== null) {
    playerTeams.delete(id);
  } else {
    return null;
  }
  window.dispatchEvent(new CustomEvent('playerTeamUpdated', { detail: { id, team: normalized } }));
  return normalized;
}

export function getPlayerTeam(id) {
  if (!id) return null;
  if (id === 'self') return myTeam;
  return playerTeams.get(id) ?? null;
}

export function clearPlayerTeam(id) {
  if (!id) return;
  if (playerTeams.delete(id)) {
    window.dispatchEvent(new CustomEvent('playerTeamUpdated', { detail: { id, team: null } }));
  }
}

export function resetTeams() {
  myTeam = null;
  playerTeams.clear();
  window.dispatchEvent(new CustomEvent('teamChanged', { detail: { team: myTeam } }));
}

export function isEnemyTeam(team) {
  const normalized = normalizeTeam(team);
  const mine = getMyTeam();
  if (!normalized || !mine) return false;
  return normalized !== mine;
}

export function areAllies(teamA, teamB) {
  const a = normalizeTeam(teamA);
  const b = normalizeTeam(teamB);
  if (!a || !b) return false;
  return a === b;
}

export function isEnemyId(id) {
  const team = getPlayerTeam(id);
  if (!team) return false;
  return isEnemyTeam(team);
}

export function getTeamMeshColor(team) {
  const normalized = normalizeTeam(team);
  if (normalized === TEAM_BLUE) return 0x2563eb;
  if (normalized === TEAM_RED) return 0xdc2626;
  return 0x6b7280;
}

export function getHealthBarColorForTeam(team) {
  const normalized = normalizeTeam(team);
  if (!normalized) return '#cbd5f5';
  return isEnemyTeam(normalized) ? '#e74c3c' : '#1abc9c';
}
