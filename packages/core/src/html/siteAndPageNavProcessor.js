const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio'); require('../patches/htmlparser2');
const md = require('../lib/markdown-it');

const {
  SITE_NAV_EMPTY_LINE_REGEX,
  SITE_NAV_LIST_CLASS,
  SITE_NAV_LIST_CLASS_ROOT,
  SITE_NAV_LIST_ITEM_CLASS,
  SITE_NAV_DEFAULT_LIST_ITEM_CLASS,
  SITE_NAV_CUSTOM_LIST_ITEM_CLASS,
  SITE_NAV_DROPDOWN_EXPAND_KEYWORD_REGEX,
  SITE_NAV_DROPDOWN_ICON_ROTATED_HTML,
  SITE_NAV_DROPDOWN_ICON_HTML,
} = require('../Page/constants');

/**
 * Replaces and stores a uuid identifier to the only page-nav element, if there is one.
 *
 * The page-nav can only be used inside a layout,
 * but can be constructed only after the page has been built.
 * Hence, this requires post insertion of the page nav.
 *
 * This uuid identifier is asserted to be unique in the html file once html processing is done,
 * otherwise it is replaced with one until it is unique.
 */
class PageNavProcessor {
  constructor() {
    this.uuidTextNode = undefined;
  }

  getUuid() {
    return (this.uuidTextNode && this.uuidTextNode.data) || '';
  }

  renderPageNav(node) {
    [this.uuidTextNode] = cheerio.parseHTML(uuidv4());
    cheerio(node).replaceWith(this.uuidTextNode);
  }

  finalizePageNavUuid(mainHtml, mainHtmlNodes, footnotesHtml) {
    if (!this.uuidTextNode) {
      return mainHtml;
    }

    let mainHtmlString = mainHtml;
    let numMatches;
    do {
      const pageNavUuidRegex = new RegExp(this.uuidTextNode.data, 'g');
      const mainHtmlMatch = mainHtmlString.match(pageNavUuidRegex);
      const footnotesMatch = footnotesHtml.match(pageNavUuidRegex);
      numMatches = (mainHtmlMatch ? mainHtmlMatch.length : 0) + (footnotesMatch ? footnotesMatch.length : 0);

      if (numMatches > 1) {
        this.uuidTextNode.data = uuidv4();
        mainHtmlString = cheerio(mainHtmlNodes).html();
      }
    } while (numMatches > 1);

    return mainHtmlString;
  }
}

function renderSiteNav(node) {
  const $original = cheerio(node);
  const siteNavText = $original.text().trim();
  if (siteNavText === '') {
    return;
  }

  // collapse into tight list
  const siteNavHtml = md.render(siteNavText.replace(SITE_NAV_EMPTY_LINE_REGEX, '\n'));
  const $ = cheerio.load(`<site-nav>${siteNavHtml}</site-nav>`);

  $('ul').each((i1, ulElem) => {
    const nestingLevel = $(ulElem).parents('ul').length;
    $(ulElem).addClass(SITE_NAV_LIST_CLASS);
    if (nestingLevel === 0) {
      $(ulElem).attr('mb-site-nav', true);
      $(ulElem).addClass(SITE_NAV_LIST_CLASS_ROOT);
    }
    const listItemLevelClass = `${SITE_NAV_LIST_ITEM_CLASS}-${nestingLevel}`;
    const defaultListItemClass = `${SITE_NAV_DEFAULT_LIST_ITEM_CLASS} ${listItemLevelClass}`;
    const customListItemClasses = `${SITE_NAV_CUSTOM_LIST_ITEM_CLASS} ${listItemLevelClass}`;

    $(ulElem).children('li').each((i2, liElem) => {
      const nestedLists = $(liElem).children('ul');
      const nestedAnchors = $(liElem).children('a');
      if (nestedLists.length === 0 && nestedAnchors.length === 0) {
        $(liElem).addClass(customListItemClasses);
        return;
      }

      const listItemContent = $(liElem).contents().not('ul');
      const listItemContentHtml = $.html(listItemContent);
      listItemContent.remove();
      $(liElem).prepend(`<div class="${defaultListItemClass}" onclick="handleSiteNavClick(this)">`
        + `${listItemContentHtml}</div>`);
      if (nestedLists.length === 0) {
        return;
      }

      // Found nested list, render dropdown menu
      const listItemParent = $(liElem).children().first();

      const hasExpandedKeyword = SITE_NAV_DROPDOWN_EXPAND_KEYWORD_REGEX.test(listItemContentHtml);
      if (hasExpandedKeyword) {
        nestedLists.addClass('site-nav-dropdown-container site-nav-dropdown-container-open');
        listItemParent.html(listItemContentHtml.replace(SITE_NAV_DROPDOWN_EXPAND_KEYWORD_REGEX, ''));
        listItemParent.append(SITE_NAV_DROPDOWN_ICON_ROTATED_HTML);
      } else {
        nestedLists.addClass('site-nav-dropdown-container');
        listItemParent.append(SITE_NAV_DROPDOWN_ICON_HTML);
      }
    });
  });

  $original.empty();
  $original.append($('site-nav').children());
}

function addOverlayPortalSource(node, to) {
  node.attribs['tag-name'] = node.name;
  node.attribs.to = to;
  node.name = 'overlay-source';
}

/**
 * Wrap id="site/page-nav", and the <site-nav> component with a <nav-portal> vue component.
 * This component portals said element into the mobile navbar menus as needed.
 */
function addSitePageNavPortal(node) {
  if (node.attribs.id === 'site-nav' || node.attribs.id === 'page-nav') {
    addOverlayPortalSource(node, node.attribs.id);
  } else if (node.attribs['mb-site-nav']) {
    addOverlayPortalSource(node, 'mb-site-nav');
    delete node.attribs['mb-site-nav'];
  }
}

module.exports = {
  PageNavProcessor,
  renderSiteNav,
  addSitePageNavPortal,
};
