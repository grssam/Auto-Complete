/* ***** BEGIN LICENSE BLOCK *****
 * Version: MIT/X11 License
 * 
 * Copyright (c) 2011 Girish Sharma
 * 
 * Permission is hereby granted, free of charge, to any person obtaining copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 *
 * Contributor:
 *   Girish Sharma <scrapmachines@gmail.com> (Creator)
 *
 * ***** END LICENSE BLOCK ***** */

const {classes: Cc, interfaces: Ci, manager: Cm, utils: Cu} = Components;
const global = this;
Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/PlacesUtils.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

// Keep track of the type of suggestion made
let suggestedByOrder = false;

// Keep track of what is being queried
let currentQuery = "";
let suggestionIndex = 0;

// Keep track of suggestions based on current query/ref/params
let suggestions = [];
let orderedSuggestions = [];

// Keep a sorted list of keywords to suggest
let sortedKeywords = [];
// Keep an ordered list of keywords to suggest
let orderedKeywords = [];

// Keep track of search suggestion and the current search engine
let searchSuggestionDisplayed = false;

// Keep track of delete keypress
let deleting = false;

// Lookup a keyword to suggest for the provided query
function getKeyword(query,window) {

  suggestedByOrder = false;
  // Remember the original query to preserve its original casing
  let origQuery = query;

  // Split the query into before and after the last space
  let lastStart = query.lastIndexOf(" ") + 1;
  let before = query.slice(0, lastStart);

  // Suggest keywords for the last word of the query
  query = query.slice(lastStart).toLowerCase();

  let beforeParts,afterIndex,ordered_Keywords;
  // Suggest the next word from ordered keywords if possible
  if (query == "" && before != "" && orderedSuggestions.length > 1) {
    beforeParts = before.split(" ").filter(function(part) {
      return part.length > 0;
    });
    afterIndex = orderedSuggestions.indexOf(beforeParts.slice(-1)[0]) + 1;
    // Return if we don't have anything relevant to suggest
    if (afterIndex >= orderedSuggestions.length)
      return;
    // Now that we have a word to display
    let after = orderedSuggestions[afterIndex];
    suggestedByOrder = true;
    return origQuery + (before + after).slice(origQuery.length);
  }
  // Don't suggest a keyword when not possible
  else if (query == "" && before != "") {
    // get a local reference to ordered keywords and select the matching set
    ordered_Keywords = orderedKeywords;
    ordered_Keywords.some(function(parts) {
      beforeParts = before.split(" ").filter(function(part) {
        return part.length > 0;
      });
      let divider = parts.indexOf(beforeParts.slice(-1)[0]);
      if (divider != -1) {
        orderedSuggestions = parts.slice(divider);
        return true;
      }
    });
    if (orderedSuggestions.length > 1) {
      beforeParts = before.split(" ").filter(function(part) {
        return part.length > 0;
      });
      afterIndex = orderedSuggestions.indexOf(beforeParts.slice(-1)[0]) + 1;
      // Return if we don't have anything relevant to suggest
      if (afterIndex >= orderedSuggestions.length)
        return;
      // Now that we have a word to display
      let after = orderedSuggestions[afterIndex];
      suggestedByOrder = true;
      return origQuery + (before + after).slice(origQuery.length);
    }
    else
      return;
  }
  else if (query == "")
    return;

  // If this is same as currentQuery, then just return the next result
  if (origQuery == currentQuery) {
    let keyword = (suggestions.length > 0
      ?suggestions[suggestionIndex%suggestions.length]:"");
    if (before == "" && keyword != "") {
      ordered_Keywords = orderedKeywords;
      ordered_Keywords.some(function(parts) {
        if (parts.indexOf(keyword) != -1) {
          orderedSuggestions = parts.slice(parts.indexOf(keyword));
          return true;
        }
      });
    }
    return origQuery + (before + keyword).slice(origQuery.length);
  }
  else
    currentQuery = origQuery;

  // Empty the ordered suggestions
  orderedSuggestions.length = 0;
  if (before != "") {
    // get a local reference to ordered keywords and select the matching set
    ordered_Keywords = orderedKeywords;
    ordered_Keywords.some(function(parts) {
      beforeParts = before.split(" ").filter(function(part) {
        return part.length > 0;
      });
      let divider = parts.indexOf(beforeParts.slice(-1)[0]);
      if (divider != -1) {
        orderedSuggestions = parts.slice(divider);
        return true;
      }
    });
  }

  // Get a local keywords reference and ignore domains for multi-word
  let keywords = orderedSuggestions.concat(sortedKeywords);
  if (before != "")
    keywords = keywords.filter(function(word) word.indexOf(".") == -1);

  // Find the first keyword that matches the beginning of the query
  let queryLen = query.length;
  let sortedLen = keywords.length;
  suggestions = [];
  for (let i = 0; i < sortedLen; i++) {
    let keyword = keywords[i];
    if (keyword.slice(0, queryLen) == query)
      if (suggestions.indexOf(keyword) == -1)
        suggestions.push(keyword);
    if (suggestions.length == 5)
      break;
  }
  if (suggestions.length > 0 && before == "") {
    ordered_Keywords = orderedKeywords;
    ordered_Keywords.some(function(parts) {
      if (parts.indexOf(suggestions[0].trim()) != -1) {
        orderedSuggestions = parts.slice(parts.indexOf(suggestions[0]));
        return true;
      }
    });
  }
  return origQuery +
    (suggestions.length > 0?(before + suggestions[0]).slice(origQuery.length):"");
}

// Automatically suggest a keyword when typing in the location bar
function addKeywordSuggestions(window) {
  let {gURLBar} = window;
  let {async} = makeWindowHelpers(window);
  deleting = false;

  // Look for deletes to handle them better on input
  listen(window, gURLBar, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_BACK_SPACE:
      case event.DOM_VK_DELETE:
        deleting = true;
        break;
    }
  });

  // Detect tab presses to move the selection to the end ready for more
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_TAB:
        // Ignore tabs for switching tabs
        if (event.ctrlKey)
          return;

        // Preventing the use of TAB as scrolling of popup results.
        event.preventDefault();
        event.stopPropagation();

        // Ignore if the selection starts at front or nothing it selected
        let input = event.originalTarget;
        let {selectionEnd, selectionStart} = input;

        if (selectionStart == 0 || selectionEnd == selectionStart)
          return;

        // Move the selection to the end and stop the normal behavior
        input.setSelectionRange(selectionEnd, selectionEnd);

        break;
    }
  });

  // Watch for urlbar value input changes to suggest keywords
  listen(window, gURLBar, "input", function(event) {
    suggestionIndex = 0;

    // Don't try suggesting a keyword when the user wants to delete
    if (deleting) {
      // Updating the current Query for alternate suggestion purpose
      currentQuery = gURLBar.textValue;
      deleting = false;
      // Make sure the search suggestions show up without slecting or suggesting
      async(function() gURLBar.controller.startSearch(gURLBar.value));
      return;
    }

    // See if we can suggest a keyword if it isn't the current query
    let query = gURLBar.textValue;
    let keyword = getKeyword(query,window);
    if (keyword == null || keyword == query)
      return;

    // Select the end of the suggestion to allow over-typing
    gURLBar.value = keyword;
    gURLBar.selectTextRange(query.length, keyword.length);

    // Make sure the search suggestions show up
    async(function() gURLBar.controller.startSearch(gURLBar.value));
  });
}

// Automatically select the first location bar result on pressing enter
function addEnterSelects(window) {
  // Remember what auto-select if enter was hit after starting a search
  let autoSelectOn;
  // Keep track of last shown result's search string
  let lastSearch;
  // Keep track of what was in gURLBar originally
  let valueB4Enter;
  let {async} = makeWindowHelpers(window);

  // Add some helper functions to various objects
  let gURLBar = window.gURLBar;
  let popup = gURLBar.popup;
  popup.__defineGetter__("noResults", function() {
    return this._matchCount == 0;
  });
  gURLBar.__defineGetter__("trimmedSearch", function() {
    return this.controller.searchString.trim();
  });
  gURLBar.__defineGetter__("willHandle", function() {
    // Potentially it's a url if there's no spaces
    let search = this.trimmedSearch;
    if (search.match(/ /) == null) {
      try {
        // Quit early if the input is already a URI
        return Services.io.newURI(gURLBar.value, null, null);
      }
      catch(ex) {}

      try {
        // Quit early if the input is domain-like (e.g., site.com/page)
        return Cc["@mozilla.org/network/effective-tld-service;1"].
          getService(Ci.nsIEffectiveTLDService).
          getBaseDomainFromHost(gURLBar.value);
      }
      catch(ex) {}
    }

    // Check if there's an search engine registered for the first keyword
    let keyword = search.split(/\s+/)[0];
    return Services.search.getEngineByAlias(keyword);
  });

  // Wait for results to get added to the popup
  let (orig = popup._appendCurrentResult) {
    popup._appendCurrentResult = function() {
      // Run the original first to get results added
      orig.apply(this, arguments);

      // Don't bother if something is already selected
      if (popup.selectedIndex >= 0)
        return;

      // Make sure there's results
      if (popup.noResults)
        return;

      // Unless we just completed a domain, don't auto-select if we have a url
      if (gURLBar.willHandle)
        return;

      // We passed all the checks, so pretend the user has the first result
      // selected, so this causes the UI to show the selection style
      popup.selectedIndex = 0;

      // If the just-added result is what to auto-select, make it happen
      if (autoSelectOn == gURLBar.trimmedSearch) {
        // Clear out what to auto-select now that we've done it once
        autoSelectOn = null;
        gURLBar.controller.handleEnter(true);
      }

      // Remember this to notice if the search changes
      lastSearch = gURLBar.trimmedSearch;
    };

    unload(function() popup._appendCurrentResult = orig, window);
  }

  // Function to display the next suggestion based on current query
  function suggestNextMatch(delta) {
    // If we suggested by order, then don't scrol through alt suggestions
    if (suggestedByOrder)
      return;
    suggestionIndex+=delta;
    let keyword = getKeyword(currentQuery);
    if (keyword == null || keyword == currentQuery)
      return;

    // Select the end of the suggestion to allow over-typing
    gURLBar.value = keyword;
    gURLBar.selectTextRange(currentQuery.length, keyword.length);

    // Make sure the search suggestions show up
    async(function() gURLBar.controller.startSearch(gURLBar.value));
  }

  listen(window, gURLBar, "keydown", function(aEvent) {
    let KeyEvent = aEvent;
    switch (aEvent.keyCode) {
      // For horizontal movement, unselect the first item to allow editing
      case KeyEvent.DOM_VK_LEFT:
      case KeyEvent.DOM_VK_RIGHT:
      case KeyEvent.DOM_VK_HOME:
        popup.selectedIndex = -1;
        return;

      // For vertical movement, show alternate suggestions
      case KeyEvent.DOM_VK_UP:
        if (aEvent.ctrlKey)
          suggestNextMatch(-1);
        return;
      case KeyEvent.DOM_VK_DOWN:
        if (aEvent.ctrlKey)
          suggestNextMatch(+1);
        return;

      // We're interested in handling enter (return), do so below
      case KeyEvent.DOM_VK_RETURN:
        break;

      // For anything else, deselect the entry if the search changed
      default:
        if (lastSearch != gURLBar.trimmedSearch && !searchSuggestionDisplayed)
          popup.selectedIndex = -1;
        return;
    }

    // Ignore special key combinations
    if (aEvent.shiftKey || aEvent.ctrlKey || aEvent.metaKey)
      return;

    // Deselect if the selected result isn't for the current search
    if (!popup.noResults && lastSearch != gURLBar.trimmedSearch && !searchSuggestionDisplayed) {
      popup.selectedIndex = -1;

      // If it's not a url, we'll want to auto-select the first result
      if (!gURLBar.willHandle) {
        autoSelectOn = gURLBar.trimmedSearch;

        // Don't load what's typed in the location bar because it's a search
        aEvent.preventDefault();
      }

      return;
    }

    // Prevent the default enter (return) behavior
    aEvent.preventDefault();

    // Calling handleEnter will cause the selected popup item to be used
    gURLBar.mEnterEvent = aEvent;
    gURLBar.controller.handleEnter(true);
  });

  // Detect deletes of text to avoid accidentally deleting items
  listen(window, gURLBar.parentNode, "keypress", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_BACK_SPACE:
      case event.DOM_VK_DELETE:
        // The value will be the last search if auto-selected; otherwise the
        // value will be the manually selected autocomplete entry
        if (gURLBar.value != lastSearch)
          return;

        // Hack around to prevent deleting an entry
        let {mPopupOpen} = popup;
        popup.mPopupOpen = false;

        // Restore the original popup open value
        async(function() {
          popup.mPopupOpen = mPopupOpen;
        });
        break;
    }
  });

  // Detect pressing of Escape key and blur out of urlBar
  listen(window, gURLBar, "keydown", function(event) {
    switch (event.keyCode) {
      case event.DOM_VK_ESCAPE:
        let input = event.originalTarget;
        let {selectionEnd, selectionStart} = input;
        event.stopPropagation();
        event.preventDefault();
        if ((selectionStart == 0 || selectionStart == selectionEnd)
          && selectionEnd == gURLBar.value.length && !popup.mPopupOpen)
            window.gBrowser.selectedBrowser.focus();
        else if (popup.mPopupOpen) {
          popup.selectedIndex = -1;
          popup.hidePopup();
        }
        else {
          gURLBar.value = valueB4Enter;
          gURLBar.selectTextRange(0, gURLBar.value.length);
        }
        break;
    }
  });

  // Handle the gURLBar value upon entering and leaving
  listen(window, gURLBar, "blur", function(event) {
    gURLBar.value = valueB4Enter;
  });
  listen(window, gURLBar, "focus", function(event) {
    valueB4Enter = gURLBar.value;
  });
}

// Convert a query to a search url
let convertToSearchURL = function() {};

// Checks if the current input is already a uri
function isURI(input) {
  try {
    // Quit early if the input is already a URI
    return Services.io.newURI(input, null, null);
  }
  catch(ex) {}

  try {
    // Quit early if the input is domain-like (e.g., site.com/page)
    return Cc["@mozilla.org/network/effective-tld-service;1"].
      getService(Ci.nsIEffectiveTLDService).
      getBaseDomainFromHost(input);
  }
  catch(ex) {}
  return false;
}

// Function to searching facility if no match found
function addSearchSuggestion(window) {
  let {change} = makeWindowHelpers(window);
  let {gURLBar} = window;
  let {popup} = gURLBar;

  // Convert the query into search engine specific url
  function getSearchURL(input) {
    return isURI(input) != false?input : convertToSearchURL(input);
  }

  // Convert inputs to search urls
  change(gURLBar, "_canonizeURL", function(orig) {
    return function(event) {
      if (event != null && !(event.ctrlKey || event.shiftKey || event.metaKey))
        if (((popup._matchCount == 1 && searchSuggestionDisplayed) || popup._matchCount == 0)
          && gURLBar.value.length > 0 && gURLBar.focused && pref("showSearchSuggestion"))
            this.value = getSearchURL(this.value);
      return orig.call(this, event);
    };
  });


  // Provide a way to set the autocomplete search engines and initialize
  function setSearch(engines) {
    gURLBar.setAttribute("autocompletesearch", engines);
    gURLBar.mSearchNames = null;
    gURLBar.initSearchNames();
  };

  // Add in the twitter search and remove on cleanup
  let origSearch = gURLBar.getAttribute("autocompletesearch");
  setSearch("google " + origSearch);
  unload(function() setSearch(origSearch));
}

// Add an autocomplete search engine to provide location bar suggestions
function addAutoCompleteSearch(window) {
  let seachEngineService = Components.classes["@mozilla.org/browser/search-service;1"]
    .getService(Components.interfaces.nsIBrowserSearchService);
  // Getting the current search engine
  let currentSearchEngine = seachEngineService.currentEngine;
  // If no current search engine , then using the first one
  if (currentSearchEngine == null)
    currentSearchEngine = seachEngineService.getEngines()[0];

  // Updating the convertToSearchURL function
  convertToSearchURL = function (query) {
    return currentSearchEngine.getSubmission(query).uri.spec;
  };

  let engineName = currentSearchEngine.name;
  const contract = "@mozilla.org/autocomplete/search;1?name=" + engineName.toLowerCase();
  const desc = engineName + " AutoComplete";
  const uuid = Components.ID("42778970-8fae-454d-ad3f-eea88b945af1");
  let {gURLBar} = window;
  let {popup} = gURLBar;
  let {async} = makeWindowHelpers(window);

  // Keep a timer to send a delayed no match
  let timer;
  function clearTimer() {
    if (timer != null)
      timer.cancel();
    timer = null;
  }
  function setTimer(callback) {
    timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    timer.initWithCallback({
      notify: function() {
        timer = null;
        callback();
      }
    }, 1000, timer.TYPE_ONE_SHOT);
  }
  function searchValid(query) {
    return ((popup._matchCount == 1 && searchSuggestionDisplayed) || popup._matchCount == 0)
      && gURLBar.value.length > 0 && gURLBar.focused && !deleting && isURI(query) == false
      && pref("showSearchSuggestion");
  }

  // Implement the autocomplete search that handles twitter queries
  let search = {
    createInstance: function(outer, iid) search.QueryInterface(iid),

    QueryInterface: XPCOMUtils.generateQI([Ci.nsIAutoCompleteSearch]),

    // Handle searches from the location bar
    startSearch: function(query, param, previous, listener) {
      // Always clear the timer on a new search
      clearTimer();

      async(function() {
        // Only display Google Search option when no results
        if (searchValid(query)) {
          let label = "Search " + engineName + " for " + query;
          searchSuggestionDisplayed = true;
          // Call the listener immediately with one result
          listener.onSearchResult(search, {
            getCommentAt: function() engineName + " search: " + query,

            getImageAt: function() SEARCH_ICON,

            getLabelAt: function() label,

            getValueAt: function() convertToSearchURL(query),

            getStyleAt: function() "favicon",

            get matchCount() 1,

            QueryInterface: XPCOMUtils.generateQI([Ci.nsIAutoCompleteResult]),

            removeValueAt: function() {},

            searchResult: Ci.nsIAutoCompleteResult.RESULT_SUCCESS,

            get searchString() query,
          });
        }
        // Send a delayed NOMATCH so the autocomplete doesn't close early
        else {
          searchSuggestionDisplayed = false;
          setTimer(function() {
            listener.onSearchResult(search, {
              searchResult: Ci.nsIAutoCompleteResult.RESULT_NOMATCH,
            });
          });
        }
      }, 100);
    },

    // Nothing to cancel other than a delayed search as results are synchronous
    stopSearch: function() {
      clearTimer();
    },
  };

  // Register this autocomplete search service and clean up when necessary
  const registrar = Ci.nsIComponentRegistrar;
  Cm.QueryInterface(registrar).registerFactory(uuid, desc, contract, search);
  unload(function() {
    Cm.QueryInterface(registrar).unregisterFactory(uuid, search);
  });
}

// Look through various places to find potential keywords
function populateKeywords() {

  // Keep a nested array of array of keywords -- 2 arrays per entry
  let allKeywords = [];

  // XXX Force a QI until bug 609139 is fixed
  let {DBConnection} = PlacesUtils.history.QueryInterface(Ci.nsPIPlacesDatabase);

  let tagSvc = Cc["@mozilla.org/browser/tagging-service;1"].
    getService(Ci.nsITaggingService);

  // Break a string into individual words separated by the splitter
  function explode(text, splitter) {
    return (text || "").toLowerCase().split(splitter).filter(function(word) {
      // Only interested in not too-short words
      return word && word.length > 3;
    });
  }

  // Add the domain (without www) for the url
  function addDomain(url) {
    try {
      // Extract the domain and the top level domain
      let domain = url.match(/[\/@](?:www\.)?([^\/@:]+)[\/:]/)[1];
      let suffix = Services.eTLD.getPublicSuffixFromHost(domain);

      // Ignore special hostnames like localhost
      if (suffix == domain)
        suffix = "";
      let {length} = suffix;

      // Convert the full domain a.b.c into parts: a.b.c, b.c in order
      domain.split(".").forEach(function(val, index, all) {
        // Only add if it's more than the suffix
        let part = all.slice(index).join(".");
        if (part.length > length)
          allKeywords.push([part]);
      });
    }
    // Must have be some strange format url that we probably don't care about
    catch(ex) {}
  }

  // Don't add domains if the user doesn't want them
  if (!pref("showDomains"))
    addDomain = function() {};

  // Add keywords from the title and url
  function addTitleUrl(callback, title, url) {
    callback(explode(title, /[\s\-\/\u2010-\u202f"',.:;?!|()]+/));

    // Ignore some protocols
    if (url.search(/^(data|javascript|place)/) == 0)
      return;

    // Strip off the protocol and query/ref/params
    url = url.replace(/^[^:]*:\/*/, "");
    url = url.replace(/[?&#;].*$/, "");
    callback(explode(url, /(?:[\/:.=+]|%[0-9A-F]{2})+/));
  }

  // Add search keywords to the list as potential keywords
  function addSearchKeywords() {
    Services.search.getVisibleEngines().forEach(function({alias}) {
      // Ignore missing keywords or cleared keywords
      if (alias != null && alias != "")
        allKeywords.push([alias]);
    });
  }

  // Only add search keywords if the user wants it
  if (pref("showSearchKeywords"))
    addSearchKeywords();

  // Add bookmark keywords to the list of potential keywords
  function addBookmarkKeywords() {
    spinQueryAsync(DBConnection, {
      names: ["keyword"],
      query: "SELECT * FROM moz_keywords",
    }, {
      callback: function([resultArray]) {
        resultArray.forEach(function({keyword}) allKeywords.push([keyword]));
        addFromHistory();
      },
      args : []
    });
  }

  // Only add bookmark keywords if the user wants it
  if (pref("addBookmarkKeywords"))
    addBookmarkKeywords();
  else
    addFromHistory();

  // Use input history to discover keywords from typed letters
  function addFromHistory() {
    spinQueryAsync(DBConnection, {
      names: ["input", "url", "title"],
      query: "SELECT * " +
             "FROM moz_inputhistory " +
             "JOIN moz_places " +
             "ON id = place_id " +
             "WHERE input NOT NULL " +
             "ORDER BY frecency DESC",
    }, {
      callback: function([resultArray]) {
        resultArray.forEach(function({input, url, title}) {
          // Add keywords for word parts that start with the input word
          let word = input.trim().toLowerCase().split(/\s+/)[0];
          word = word.replace("www.", "");
          let wordLen = word.length;
          if (wordLen == 0)
            return;

          // Need a nsIURI for various interfaces to get tags
          let URI = Services.io.newURI(url, null, null);
          let tags = tagSvc.getTagsForURI(URI);

          // Only use the parts that match the beginning of the word
          function addKeywords(parts) {
            allKeywords.push(parts.filter(function(part) {
              return part.slice(0, wordLen) == word;
            }));
          }

          // Add keywords from tags, url (ignoring protocol), title
          addDomain(url);
          addKeywords(tags);
          addTitleUrl(addKeywords, title, url);
        });
        addFromBookmarks();
      },
      args: []
    });
  }

  // Use bookmarks to discover keywords from their titles or urls
  function addFromBookmarks() {
    spinQueryAsync(DBConnection, {
      names: ["url", "title"],
      query: "SELECT moz_places.url, moz_bookmarks.title " +
             "FROM moz_bookmarks " +
             "JOIN moz_places " +
             "ON moz_places.id = fk " +
             "WHERE moz_bookmarks.title NOT NULL " +
             "ORDER BY frecency DESC " +
             "LIMIT 100",
    }, {
      callback: function([resultArray]) {
        resultArray.forEach(function({url, title}) {
          addTitleUrl(function(parts) allKeywords.push(parts), title, url);
        });
        addDomains(["AND typed = 1 ORDER BY frecency DESC", 0]);
      },
      args: []
    });
  }

  // Add in some typed subdomains/domains as potential keywords
  function addDomains([extraQuery, iterate]) {
    spinQueryAsync(DBConnection, {
      names: ["url","title"],
      query: "SELECT * FROM moz_places WHERE visit_count > 1 " + extraQuery,
    }, {
      callback: function([iterate, resultArray]) {
        resultArray.forEach(function({url,title}) {
          addDomain(url);
          addTitleUrl(function(parts) allKeywords.push(parts), title, url);
        });
        if (iterate == 0)
          addDomains(["ORDER BY visit_count DESC LIMIT 100", 1]);
        else if (iterate == 1)
          addDomains(["ORDER BY last_visit_date DESC LIMIT 100", 2]);
        else
          updateKeywords();
      },
      args: [iterate]
    });
  }

  function updateKeywords() {
    // Clear out potentially any existing keywords
    sortedKeywords.length = 0;
    orderedKeywords.length = 0;

    // Do a depth first traversal of the keywords
    // Check each group of keywords and push them accordingly
    allKeywords.forEach(function(keywords) {
      let matched = false;
      orderedKeywords.some(function(orderedPart) {
        keywords.some(function(keyword) {
          if (orderedPart.indexOf(keyword) != -1) {
            matched = true;
            return true;
          }
        });
        if (matched) {
          keywords.forEach(function (part) {
            if (orderedPart.indexOf(part) == -1)
              orderedPart.push(part.slice(0));
          });
          return true;
        }
      });
      if (!matched && keywords.length > 0)
        orderedKeywords.push(keywords.slice(0));
    });

    // Do a breadth first traversal of the keywords
    do {
      // Remove any empty results and stop if there's no more
      allKeywords = allKeywords.filter(function(keywords) keywords.length > 0);
      if (allKeywords.length == 0)
        break;

      // Get the first keyword of each result and add if it doesn't exist
      allKeywords.map(function(keywords) {
        let keyword = keywords.shift();
        if (sortedKeywords.indexOf(keyword) == -1) {
          sortedKeywords.push(keyword);
        }
      });
    } while (true);
  }
}

// Handle the add-on being activated on install/enable 
function startup(data) AddonManager.getAddonByID(data.id, function(addon) {
  // Load various javascript includes for helper functions
  ["pref", "helper"].forEach(function(fileName) {
    let fileURI = addon.getResourceURI("scripts/" + fileName + ".js");
    Services.scriptloader.loadSubScript(fileURI.spec, global);
  });

  Cu.import("resource://services-sync/util.js");

  // Watch for preference changes to reprocess the keyword data
  pref.observe([
    "showBookmarks",
    "showDomains",
    "showSearchKeywords",
    "adaptiveAlgorithm",
  ], function() populateKeywords());

  // Add suggestions to all windows
  watchWindows(addKeywordSuggestions);
  // Add enter-selects functionality to all windows
  watchWindows(addEnterSelects);
  // Add functionality to do search based on current engine
  // via address bar if no result matches
  if (pref("showSearchSuggestion")) {
    watchWindows(addSearchSuggestion);
    watchWindows(addAutoCompleteSearch);
  }

  // Fill up the keyword information
  populateKeywords();
});

function shutdown(data, reason) {
  // Clean up with unloaders when we're deactivating
  if (reason != APP_SHUTDOWN)
    unload();
}

function install() {}
function uninstall() {}
