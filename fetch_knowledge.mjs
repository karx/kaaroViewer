import { log } from './logger.mjs';

async function getEntityImages(QID) {
  let primaryImages = await _getEntityPrimaryImages(QID);
  let linkedImages = await _getEntitySecondaryImages(QID);

  log('SPARQL', `getEntityImages: ${QID}`, { primary: primaryImages.length, linked: linkedImages.length });

  let mixed_list = [...primaryImages, ...linkedImages];
  let array_of_imags = mixed_list.map(data => data.url);
  array_of_imags = array_of_imags.map(imgURL =>
    imgURL.replace("http://", "https://")
  );
  array_of_imags = array_of_imags.filter(imgURL => !imgURL.includes(".svg"));
  return array_of_imags;
}

async function _getEntityPrimaryImages(QID) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    Accept: "application/sparql-results+json"
  };
  const SPARQL = `
        SELECT ?img
        WHERE 
        {
          wd:${QID} wdt:P18 ?image
        
          BIND(REPLACE(wikibase:decodeUri(STR(?image)), "http://commons.wikimedia.org/wiki/Special:FilePath/", "") as ?fileName) .
          BIND(REPLACE(?fileName, " ", "_") as ?safeFileName)
          BIND(MD5(?safeFileName) as ?fileNameMD5) .
          BIND(CONCAT("https://upload.wikimedia.org/wikipedia/commons/thumb/", SUBSTR(?fileNameMD5, 1, 1), "/", SUBSTR(?fileNameMD5, 1, 2), "/", ?safeFileName, "/650px-", ?safeFileName) as ?img)
      
        }
      `;
  const primaryImagesResponse = await fetch(
    `https://query.wikidata.org/sparql?query=${SPARQL}&format=json`,
    { method: "GET", headers }
  );
  const primaryImages = await primaryImagesResponse.json();

  if (primaryImages?.results?.bindings) {
    return primaryImages.results.bindings.map(data => ({ url: data.img.value }));
  }
  return [];
}

async function _getEntitySecondaryImages(QID) {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    Accept: "application/sparql-results+json"
  };
  const SPARQL = `
      SELECT ?itemLevel2Label ?prop ?imgLvl2
      WHERE 
      {
          wd:${QID} ?prop ?itemLevel2.
          ?itemLevel2 wdt:P18 ?image.
          BIND(REPLACE(wikibase:decodeUri(STR(?image)), "http://commons.wikimedia.org/wiki/Special:FilePath/", "") as ?fileName) .
          BIND(REPLACE(?fileName, " ", "_") as ?safeFileName)
          BIND(MD5(?safeFileName) as ?fileNameMD5) .
          BIND(CONCAT("https://upload.wikimedia.org/wikipedia/commons/thumb/", SUBSTR(?fileNameMD5, 1, 1), "/", SUBSTR(?fileNameMD5, 1, 2), "/", ?safeFileName, "/650px-", ?safeFileName) as ?imgLvl2)
        
        SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
      }
      `;
  const secondaryImagesResponse = await fetch(
    `https://query.wikidata.org/sparql?query=${SPARQL}&format=json`,
    { method: "GET", headers }
  );
  let secondaryImages;
  try {
    secondaryImages = await secondaryImagesResponse.json();
  } catch (err) {
    log('ERROR', `_getEntitySecondaryImages parse failed: ${QID}`, { message: err.message });
    return [];
  }

  return (secondaryImages?.results?.bindings ?? []).map(data => ({
    url: data.imgLvl2.value,
    prop: data.prop,
    value: data.itemLevel2Label.value,
  }));
}

async function _sparqlQuery(query, _label = 'sparql') {
  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36",
    Accept: "application/sparql-results+json"
  };

  log('SPARQL', `request → ${_label}`, { label: _label, queryPreview: query.trim().slice(0, 120) });
  const t0 = performance.now();

  let sparqlQueryResponse;
  try {
    sparqlQueryResponse = await fetch(
      `https://query.wikidata.org/sparql?query=${query}&format=json`,
      { method: "GET", headers }
    );
  } catch (err) {
    log('ERROR', `SPARQL fetch failed: ${_label}`, { label: _label, message: err.message });
    return null;
  }

  let sparqlResponse;
  try {
    sparqlResponse = await sparqlQueryResponse.json();
  } catch (err) {
    log('ERROR', `SPARQL parse failed: ${_label}`, { label: _label, status: sparqlQueryResponse.status, message: err.message });
    return null;
  }

  const ms = Math.round(performance.now() - t0);
  const bindings = sparqlResponse?.results?.bindings ?? [];
  log('SPARQL', `response ← ${_label} · ${bindings.length} bindings (${ms}ms)`, {
    label: _label,
    ms,
    bindingCount: bindings.length,
    sample: bindings.slice(0, 2),
  });

  return sparqlResponse || null;
}

async function getEntityByte(QID) {
  let SparqlQueryForEntityData = `
  SELECT ?quid ?quidLabel ?instanceofLabel ?image_url
  WHERE 
  {    
    VALUES ?quid {wd:${QID}}
    wd:${QID} wdt:P31 ?instanceof .
    wd:${QID} (wdt:P18|wdt:P41) ?image .
    

    BIND(REPLACE(wikibase:decodeUri(STR(?image)), "http://commons.wikimedia.org/wiki/Special:FilePath/", "") as ?fileName) .
    BIND(REPLACE(?fileName, " ", "_") as ?safeFileName)
    BIND(MD5(?safeFileName) as ?fileNameMD5) .
    BIND(CONCAT("https://upload.wikimedia.org/wikipedia/commons/thumb/", SUBSTR(?fileNameMD5, 1, 1), "/", SUBSTR(?fileNameMD5, 1, 2), "/", ?safeFileName, "/650px-", ?safeFileName) as ?image_url)
      
    SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }

  }
`;

  let SparqlQueryForFirstHopData = 
  `
    SELECT ?propLabel ?level2Node ?level2NodeLabel ?level2InstanceOfLabel ?level2_image_url
    WHERE 
    {    
      VALUES ?props {wd:Q5 wd:Q2221906 wd:Q48264 wd:Q515}
      wd:${QID} ?prop ?level2Node .
      ?level2Node wdt:P31 ?props .
      ?level2Node wdt:P31 ?level2InstanceOf .
      ?level2Node wdt:P18 ?level2Image .
      
      
      BIND(REPLACE(wikibase:decodeUri(STR(?level2Image)), "http://commons.wikimedia.org/wiki/Special:FilePath/", "") as ?fileName) .
      BIND(REPLACE(?fileName, " ", "_") as ?safeFileName)
      BIND(MD5(?safeFileName) as ?fileNameMD5) .
      BIND(CONCAT("https://upload.wikimedia.org/wikipedia/commons/thumb/", SUBSTR(?fileNameMD5, 1, 1), "/", SUBSTR(?fileNameMD5, 1, 2), "/", ?safeFileName, "/650px-", ?safeFileName) as ?level2_image_url)
        

      SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
  
    }
    `;


  log('SPARQL', `getEntityByte: ${QID}`, { qid: QID });
  let data     = _sparqlQuery(SparqlQueryForEntityData,    `entityData:${QID}`);
  let firsthop = _sparqlQuery(SparqlQueryForFirstHopData,  `firsthop:${QID}`);
  return {
    data:     await data,
    firsthop: await firsthop
  };
}

export { getEntityImages, getEntityByte };
