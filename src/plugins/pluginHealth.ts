// Published by lnreader-plugins from its open GitHub issues; see
// src/lib/issue-index.ts in that repo for the format.
export const PLUGIN_ISSUE_INDEX_URL =
  'https://raw.githubusercontent.com/LNReader/lnreader-plugins/issue-index/issue-index.min.json';
export const PLUGIN_ISSUES_URL =
  'https://github.com/LNReader/lnreader-plugins/issues';

/** pluginId -> [[category, ...issueNumbers], ...] */
export type PluginIssueIndex = Record<string, number[][]>;

export const IssueCategory = {
  CantLoadNovels: 5,
  DomainChanged: 6,
} as const;

export interface PluginHealth {
  status: 'broken' | 'issues';
  /** The most severe reported problem, used for the badge label. */
  category: number;
  issueNumbers: number[];
}

const brokenCategories: readonly number[] = [
  IssueCategory.CantLoadNovels,
  IssueCategory.DomainChanged,
];

export const getPluginHealth = (
  index: PluginIssueIndex | undefined,
  pluginId: string,
): PluginHealth | undefined => {
  const groups = index?.[pluginId];
  if (!Array.isArray(groups) || !groups.length) return undefined;

  const issueNumbers = groups.flatMap(([, ...numbers]) => numbers);
  const broken = brokenCategories.find(category =>
    groups.some(([groupCategory]) => groupCategory === category),
  );

  return broken !== undefined
    ? { status: 'broken', category: broken, issueNumbers }
    : { status: 'issues', category: groups[0][0], issueNumbers };
};

export const fetchPluginIssueIndex = async (): Promise<PluginIssueIndex> => {
  const res = await fetch(PLUGIN_ISSUE_INDEX_URL);
  if (!res.ok) {
    throw new Error(`Issue index request failed: ${res.status}`);
  }
  const json: unknown = await res.json();
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error('Issue index has an unexpected format');
  }
  return json as PluginIssueIndex;
};
