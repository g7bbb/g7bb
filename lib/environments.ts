import { EnvironmentKey } from './types';

export const ENVIRONMENTS: { key: EnvironmentKey; label: string; emoji: string }[] = [
  { key: 'meteor', label: '운석충돌', emoji: '☄️' },
  { key: 'heat', label: '기온상승', emoji: '🌡️' },
  { key: 'lowland', label: '저지대', emoji: '🏞️' },
  { key: 'water', label: '물근처', emoji: '💧' },
  { key: 'highland', label: '고지대', emoji: '⛰️' },
];
