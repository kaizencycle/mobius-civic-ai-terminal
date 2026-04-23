export function rollForwardTranche(args: {
  sealedReserveTotal: number;
  currentUnits: number;
  targetUnits: number;
}) {
  return {
    sealed_reserve_total: args.sealedReserveTotal + args.targetUnits,
    next_tranche_units: Math.max(0, args.currentUnits - args.targetUnits),
    next_tranche_target: args.targetUnits,
  };
}
