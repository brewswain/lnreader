import { getPluginHealth, PluginIssueIndex } from '../pluginHealth';

const index: PluginIssueIndex = {
  broken: [
    [3, 10],
    [6, 11],
    [5, 12, 13],
  ],
  flaky: [
    [1, 20],
    [0, 21, 22],
  ],
};

describe('getPluginHealth', () => {
  it('reports load failures over domain changes and collects every issue', () => {
    expect(getPluginHealth(index, 'broken')).toEqual({
      status: 'broken',
      category: 5,
      issueNumbers: [10, 11, 12, 13],
    });
  });

  it('marks plugins with only minor issues as having issues', () => {
    expect(getPluginHealth(index, 'flaky')).toEqual({
      status: 'issues',
      category: 1,
      issueNumbers: [20, 21, 22],
    });
  });

  it('returns nothing for unreported plugins or a missing index', () => {
    expect(getPluginHealth(index, 'healthy')).toBeUndefined();
    expect(getPluginHealth(undefined, 'broken')).toBeUndefined();
  });
});
