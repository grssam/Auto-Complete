self.addEventListener('message', function(e) {
  var data = JSON.parse(e.data);
  // If first argument is true, then sort the keywords
  if (data[0] == true) {
    var sortedKeywords = [],orderedKeywords = [],allKeywords = data[1];
    // Do a depth first traversal of the keywords
    // Check each group of keywords and push them accordingly
    for (var i = 0; i < allKeywords.length; i++) {
      var matched = false, Keywords = allKeywords[i];
      orderedKeywords.some(function(orderedPart) {
        Keywords.some(function(keyword) {
          if (orderedPart.indexOf(keyword) != -1) {
            matched = true;
            return true;
          }
        });
        if (matched) {
          for (var j = 0; j < Keywords.length; j++)
            if (orderedPart.indexOf(Keywords[j]) == -1)
              orderedPart.push(Keywords[j].slice(0));
          return true;
        }
      });
      if (!matched && Keywords.length > 0)
        orderedKeywords.push(Keywords.slice(0));
    }
    // Do a breadth first traversal of the keywords
    do {
      // Remove any empty results and stop if there's no more
      allKeywords = allKeywords.filter(function(Keywords) Keywords.length > 0);
      if (allKeywords.length == 0)
        break;

      // Get the first keyword of each result and add if it doesn't exist
      allKeywords.map(function(Keywords) {
        var keyword = Keywords.shift();
        if (sortedKeywords.indexOf(keyword) == -1)
          sortedKeywords.push(keyword);
      });
    } while (true);
    self.postMessage(JSON.stringify([true, [orderedKeywords, sortedKeywords]]));
  }
  // Else return false value to tell the code that gURLBar popup has finished filling up
  else
    self.postMessage(JSON.stringify([false]));
}, false);