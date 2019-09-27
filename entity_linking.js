
module.exports = async function entityMatch(query) {
    let headers = {};
    console.log("init");
    const wikiEntityLiking = await fetch("https://opentapioca.org/api/annotate", {
      method: 'GET',
      body: {
        query: query
      },
      headers: headers,
      json: true
    });
    console.log(wikiEntityLiking);
  }