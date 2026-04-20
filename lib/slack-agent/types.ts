export type SlackAgentCommandName =
  | 'status'
  | 'vault'
  | 'cycle'
  | 'pulse'
  | 'readiness'
  | 'journal'
  | 'quest'
  | 'propose'
  | 'draft-pr'
  | 'run';

export type ParsedSlackCommand = {
  name: SlackAgentCommandName;
  args: string;
  raw: string;
};

export type MobiusManifestV1 = {
  schema?: string;
  slack_agent: {
    enabled: boolean;
    mode?: string;
    allowed_commands: string[];
    allowed_workflows: string[];
    allowed_channel_ids?: string[];
    /** Optional `owner/repo` for GitHub draft PR + workflow_dispatch (falls back to env). */
    github?: {
      repo?: string;
      default_branch?: string;
      draft_pr_path?: string;
    };
    write_policy: {
      oaa_logging_required: boolean;
      ledger_logging_for_meaningful_actions: boolean;
      auto_merge_allowed: boolean;
      protected_truth_files_read_only: boolean;
    };
  };
  repo_touch?: Record<string, unknown>;
};

export type SlackCommandResult = {
  text: string;
  blocks?: unknown[];
  /** Echo of structured audit when OAA accepted */
  oaa?: { ok: boolean; hash?: string; skipped?: boolean; error?: string };
  ledger?: { ok: boolean; skipped?: boolean; reason?: string };
};
