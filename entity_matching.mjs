import { log } from './logger.mjs';

async function entityMatch(
  query = "John Trivolta's performace in Pulp fiction was jazzy"
) {
  if (!query || query.length < 3) {
    log('ENTITY_MATCH', 'query too short — skipped', { query });
    return [];
  }

  log('ENTITY_MATCH', `request → OpenTapioca`, { query });
  const t0 = performance.now();

  let headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/50.0.2661.102 Safari/537.36"
  };

  let wikiEntityLikingResponse;
  try {
    wikiEntityLikingResponse = await fetch(
      `https://opentapioca.org/api/annotate?query=${encodeURIComponent(query)}`,
      { method: "GET", headers }
    );
  } catch (error) {
    log('ERROR', `OpenTapioca fetch failed`, { query, message: error.message });
    return [];
  }

  let wikiEntityLiking;
  try {
    wikiEntityLiking = await wikiEntityLikingResponse.json();
  } catch (error) {
    log('ERROR', `OpenTapioca response parse failed`, { query, status: wikiEntityLikingResponse.status, message: error.message });
    return [];
  }

  const ms = Math.round(performance.now() - t0);
  const annotations = wikiEntityLiking.annotations ?? [];
  let qid_list = annotations.map(m => m.best_qid).filter(quid => !!quid);

  log('ENTITY_MATCH', `response ← ${qid_list.length} QIDs matched (${ms}ms)`, {
    query,
    ms,
    qid_list,
    raw_annotations: annotations.map(a => ({
      mention: a.mention,
      best_qid: a.best_qid,
      score: a.best_qid ? a.tags?.find(t => t.id === a.best_qid)?.score : null,
    })),
  });

  return qid_list;
}

export { entityMatch };
