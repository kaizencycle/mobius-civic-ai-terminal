# MIC — runtime documentation (this repo)

**Status:** Canonical for **Mobius Civic AI Terminal** + linked protocol docs.  
**Not in scope here:** full **Mobius-Substrate** economics cathedral, tokenomics engine source, or `docs/04-TECHNICAL-ARCHITECTURE/` tree (that layout lives in the Substrate repo if used).

| Document | Role |
|----------|------|
| [mic_issuance_protocol.md](./mic_issuance_protocol.md) | MIC as integrity-gated issuance; layers; mint vs reserve |
| [mic_reserve_model.md](./mic_reserve_model.md) | Vault reserve units, tranches, Fountain vs spendable MIC |
| [mic_quorum_attestation.md](./mic_quorum_attestation.md) | Seal council (Vault v2) vs future mint authorization |
| [mic_genesis_block.md](./mic_genesis_block.md) | Proposed genesis / first Fountain-class mint ceremony (not implemented) |
| [mic_runtime_reference.md](./mic_runtime_reference.md) | Ground-truth map to routes and libraries **in this repository** |

**Related protocol (reserve → Fountain):** [../vault-to-fountain-protocol.md](../vault-to-fountain-protocol.md)  
**Seal I doctrine:** [../vault-seal-i.md](../vault-seal-i.md)  
**Vault v3 north-star (phased implementation):** [../vault-v3-setup.md](../vault-v3-setup.md)

**One-line canon:** MIC is not emitted merely because activity happened; **circulating MIC is tied to integrity, attestation, and release gates**—not to speculative macro narratives alone.
