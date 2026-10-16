import { describe, expect, it } from 'vitest'
import { getDynamicFeatureScopes } from '../../content-scripts/initialize'

function record(target: Node, addedNodes: Node[] = []): MutationRecord {
  return {
    type: 'childList',
    target,
    addedNodes: addedNodes as unknown as NodeList,
    removedNodes: [] as unknown as NodeList,
    previousSibling: null,
    nextSibling: null,
    attributeName: null,
    attributeNamespace: null,
    oldValue: null,
  }
}

describe('dynamic feature scope routing', () => {
  it('does not scan the whole document for an unrelated mutation target', () => {
    document.body.innerHTML = '<article data-testid="tweet"></article><div id="unrelated"></div>'
    const scopes = getDynamicFeatureScopes([record(document.body)])
    expect([...scopes]).toEqual([])
  })

  it('routes added tweet and dialog subtrees to their feature scopes', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<article data-testid="tweet"></article><div role="dialog"></div>'
    const scopes = getDynamicFeatureScopes([record(document.body, [wrapper])])
    expect(scopes).toEqual(new Set(['tweet', 'composer', 'scheduled']))
  })

  it('routes mutations inside navigation without invoking unrelated scopes', () => {
    document.body.innerHTML = '<nav role="navigation"><span id="label"></span></nav>'
    const label = document.getElementById('label')!
    expect(getDynamicFeatureScopes([record(label)])).toEqual(new Set(['navigation']))
  })

  it('routes inline reply editor and lazy toolbar changes to composer', () => {
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<div data-testid="tweetTextarea_0" contenteditable="true"></div>'
    expect(getDynamicFeatureScopes([record(document.body, [wrapper])]).has('composer')).toBe(true)
    wrapper.innerHTML = '<div data-testid="toolBar"><div role="tablist"></div><button data-testid="tweetButtonInline"></button></div>'
    expect(getDynamicFeatureScopes([record(wrapper.firstElementChild!)])).toContain('composer')
  })
})
