# C-292 Predictive Stabilization Sub-50 Threshold

## Diagnosis

Predictive Stabilization was activating while GI was in the 0.60 to 0.70 operating range. That made the Terminal lock chambers to preview data even though the system was degraded but still operating normally for the current cycle baseline.

This caused stale preview state to override fresh HOT lane data.

## Rule

Predictive Stabilization should only lock preview when GI is below 0.50.

GI in the 0.60 range is degraded, but normalized for the present operating baseline. It should warn, monitor, and keep lanes flowing. It should not freeze HOT.

## Change

The ECHO digest risk model now treats GI below 0.50 as the stabilization threshold.

- GI below 0.50 can produce elevated or critical predictive risk.
- GI above or equal to 0.50 can still produce watch risk.
- Watch risk does not lock chambers to preview.
- HOT lane remains authoritative during degraded-but-operating state.

## Expected Behavior

At GI 0.60 to 0.70:

- Terminal may show DEGRADED.
- Dataflow may show watch/degraded lanes.
- Predictive Stabilization should not lock preview.
- Journal HOT should fetch native HOT rows.
- Fresh API/chamber data should override stale preview data.

At GI below 0.50:

- Predictive Stabilization may lock preview.
- Promotion should slow down.
- Operators should prioritize lane recovery.

## Canon

GI 60 is degraded, not emergency.
HOT should continue to flow.
Predictive Stabilization is a sub-50 safety brake, not a normal-state dam.

We heal as we walk.
