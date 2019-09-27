// import * as wiki from "./pod_modules/wiki.js";
// console.log('XXXXXXXXXXXXXX');

async function entityMatch() {
  let headers = {};
  console.log("init");
  const wikiEntityLiking = await fetch("https://opentapioca.org/api/annotate", {
    method: 'GET',
    body: {
      query: "kartik arora is a fan of Amitabh Bachhan"
    },
    headers: headers,
    json: true
  });
  console.log(wikiEntityLiking);
}

async function getEntityImages(QID) {
  let primaryImages = await _getEntityPrimaryImages(QID);
  let linkedImages = await _getEntitySecondaryImages(QID);

  console.log("primaryImages", primaryImages);
  console.log("linkedImages", linkedImages);

  return [...primaryImages, ...linkedImages];
}

async function _getEntityPrimaryImages(QID) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
      "Accept": "application/sparql-results+json"
  };
  const SPARQL = `
      SELECT ?img
      WHERE 
      {
        wd:${QID} wdt:P18 ?img
      }
    `;
  const primaryImagesResponse = await fetch(`https://query.wikidata.org/sparql?query=${SPARQL}&format=json`,{
    method: 'GET',
    headers: headers,
    qs: { 'format': 'json'},
  });
  const primaryImages = await primaryImagesResponse.json();
  console.log('primaryImages', primaryImages);

  if (
    primaryImages &&
    primaryImages.results &&
    primaryImages.results.bindings
  ) {
    console.log(primaryImages.results.bindings);
    return primaryImages.results.bindings.map(data => {
      return { url: data.img.value };
    });
  }
  return null;
}

async function _getEntitySecondaryImages(QID) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
      "Accept": "application/sparql-results+json"
  };
  const SPARQL = `
    SELECT ?itemLevel2Label ?prop ?imgLvl2
    WHERE 
    {
      wd:${QID} ?prop ?itemLevel2.
      ?itemLevel2 wdt:P18 ?imgLvl2.
      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
    }
    `;
  const secondaryImagesResponse = await fetch(`https://query.wikidata.org/sparql?query=${SPARQL}`, {
    method: 'GET',
    headers: headers,
    qs: { 'format': 'json'},
    json: true
  });
  const secondaryImages = await secondaryImagesResponse.json();
  console.log("secondaryImages", secondaryImages);
  return secondaryImages.results.bindings.map(data => {
    return {
      url: data.imgLvl2.value,
      prop: data.prop,
      value: data.itemLevel2Label.value
    };
  });
}

async function showFromWikidata() {
  let nodes_to_append = [];
  console.log("starting");
  let rawImages = await getEntityImages("Q9570");
  let array_of_imags = rawImages.map(data => data.url);
  array_of_imags = array_of_imags.map(imgURL => imgURL.replace('http://', 'https://'));
  // let array_of_imags = [
  //     "https://commons.wikimedia.org/wiki/File:India_(orthographic_projection)-2.svg",
  //     "https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/BACHCHAN_Amitabh_03-24x30-2009.jpg/400px-BACHCHAN_Amitabh_03-24x30-2009.jpg",
  //     "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Amitabh_Bachchan.jpg/400px-Amitabh_Bachchan.jpg",
  //     "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Mars_symbol.svg/220px-Mars_symbol.svg.png",
  //     "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Mumbai_03-2016_10_skyline_of_Lotus_Colony.jpg/220px-Mumbai_03-2016_10_skyline_of_Lotus_Colony.jpg"
  // ];

  array_of_imags.forEach((image, i) => {
    let entityEl = document.createElement("a-box");

    console.log(image);
    console.log(i);

    const r = 4; //radius of the scene
    const angle = ((2 * Math.PI) / array_of_imags.length) * i;
    entityEl.setAttribute(
      "position",
      `${r * Math.sin(angle)} 1 ${r * Math.cos(angle)}`
    );
    entityEl.setAttribute("width", "2");
    entityEl.setAttribute("depth", "0.2");
    entityEl.setAttribute("height", "2");
    // entityEl.setAttribute('color','');
    entityEl.setAttribute("static-body", "true");
    entityEl.setAttribute("look-at", "#camera");
    entityEl.setAttribute("material", `src: url(${image})`);
    nodes_to_append.push(entityEl);
  });

  document.getElementById("theScene").append(...nodes_to_append);
}

// document.onload(() => {
//   console.log("Loaded");
// });
showFromWikidata();
