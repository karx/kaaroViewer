
google.charts.load("current", { packages: ["wordtree"] });
google.charts.setOnLoadCallback(initChart);

var globalChartHandle;
var options = {
  wordtree: {
    format: "implicit",
    word: "started",
    type: "double"
  }
};
var g_phrases_array = ["Let's get started shall we"];

function initChart() {
  var data = google.visualization.arrayToDataTable([
    ["Phrases"],
    ["We are now live, time to get started"]
  ]);

  var chart = new google.visualization.WordTree(
    document.getElementById("wordtree_basic")
  );
  globalChartHandle = chart;
  chart.draw(data, options);
}

async function getFocusWord(phrase) {
  var words = phrase.split(" ");
  return words[Math.floor(words.length / 2)]; // middle word
}

async function updateChartWithStrings(phrase_array, focusWord = "not_set") {
  if (phrase_array && phrase_array.length > 0 && g_phrases_array && g_phrases_array.length > 0) {
    console.log(`changing data of the graph`);
    let chart = globalChartHandle;
    let data_array = [["Phrases"]];
    g_phrases_array = [...g_phrases_array, ...phrase_array];
    if (focusWord === "not_set") {
      focusWord = await getFocusWord(phrase_array[0]);
    }
    options.wordtree.word = focusWord;

    g_phrases_array.forEach(str => {
      data_array.push([str]);
    });

    console.log(data_array);
    var data = google.visualization.arrayToDataTable(data_array);
    chart.draw(data, options);
  } else {
    console.log("empty sent to Chart With String");
  }
}


export {
    updateChartWithStrings,
    getFocusWord

}