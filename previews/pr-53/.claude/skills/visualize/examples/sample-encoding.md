# Sample Encoding: Input → Output Annotations

This file shows how to translate source text into kaaroViewer JSON, with reasoning for each decision.

---

## Source excerpt

> Zepto, founded in 2021 by 19-year-old Stanford dropouts Aadit Palicha and Kaivalya Vohra, captured 30% of India's quick commerce market within two years. The company raised $1.4B in 2024 and reached a $5B valuation while operating at negative gross margins. Its dark stores — windowless micro-warehouses in residential areas — depend on a workforce of gig delivery riders who earn ₹75–115 per hour after fuel costs.

---

## Encoded nodes

```json
{
  "id": "zepto",
  "label": "Zepto",
  "type": "company",
  "tier": "primary",
  "sentiment": "contested",
  "description": "Quick commerce startup capturing 30% of India's 10-minute delivery market. Founded 2021 by Stanford dropouts, raised $1.4B in 2024 at $5B valuation while operating at negative gross margins.",
  "metrics": {
    "Market Share":    "30%",
    "Valuation":       "$5B",
    "Funding (2024)":  "$1.4B",
    "Founded":         "2021"
  },
  "wikidata": null
}
```
**Decision log:**
- `type: "company"` not `"platform"` — it is a commercial corporation, not primarily a digital platform service
- `tier: "primary"` — named actor but not the spine; the spine in this report is the Q-commerce system itself
- `sentiment: "contested"` — the source presents both achievement (valuation) and concern (negative margins, gig worker conditions); amber aura is appropriate
- `metrics` captures the four most salient quantitative facts; units are embedded in values
- `wikidata: null` — will be filled in if found; the enrichment pipeline will create a temporal arc once Zepto's QID is known

---

```json
{
  "id": "dark-store",
  "label": "Dark Store",
  "type": "concept",
  "tier": "primary",
  "sentiment": "negative",
  "description": "Windowless micro-warehouses of ~2,000 sq ft embedded in residential neighbourhoods, optimised for 60-second bin picks. No public entrance, no natural light. The physical infrastructure of the 10-minute delivery model.",
  "metrics": {
    "Avg Size": "2,000 sq ft",
    "Pick Target": "60 seconds/bin"
  }
}
```
**Decision log:**
- `type: "concept"` not `"place"` — a dark store is a structural concept/system element, not a specific location
- `tier: "primary"` — it is a named mechanism central to the report's argument
- `sentiment: "negative"` — the description establishes harm (no light, no entrance); the author clearly frames this as exploitative infrastructure

---

```json
{
  "id": "gig-rider",
  "label": "Gig Delivery Rider",
  "type": "person",
  "tier": "spine",
  "sentiment": "positive",
  "description": "Delivery worker in India's quick commerce sector. Earns ₹75–115 per hour after fuel and maintenance costs consuming 32% of earnings. Logs 10–16 hours per day on a motorcycle in urban traffic.",
  "metrics": {
    "Hourly Take-Home": "₹75–115",
    "Fuel Cost Share":  "32%",
    "Daily Hours":      "10–16h"
  }
}
```
**Decision log:**
- `type: "person"` — represents a class of individuals; person type is correct even for collectives in a labour report
- `tier: "spine"` — this is THE subject of the report; everything orbits the gig worker's experience
- `sentiment: "positive"` — they are the protagonist the author wants the reader to care about; green aura signals "this is who we should protect"

---

## Encoded edges

```json
{ "from": "zepto", "to": "gig-rider", "rel": "employment", "label": "employs via app", "weight": 4, "directed": true }
```
**Decision log:**
- `rel: "employment"` — direct labour relationship
- `weight: 4` — high-weight because this is a central causal edge in the report (platform exploits worker)
- `directed: true` — unidirectional dependency: worker depends on platform, not the reverse in terms of power

```json
{ "from": "dark-store", "to": "gig-rider", "rel": "causes", "label": "extraction conditions", "weight": 5, "directed": true }
```
**Decision log:**
- `rel: "causes"` — the dark store system *causes* the working conditions
- `weight: 5` — this is a defining causal claim of the report; maximum weight, glow line in canvas
- `directed: true` — causal, unidirectional

---

## Encoded story beat

```json
{
  "id": "beat-platforms",
  "title": "The Contenders",
  "node": "zepto",
  "nodes": ["blinkit", "swiggy-instamart"],
  "narration": "Three companies race for the 10-minute window. Zepto at $5B holds 30% market share. Blinkit commands 50% with a $13B valuation. Swiggy Instamart runs at negative margins to survive. They do not compete on products. They compete on minutes — and the arithmetic only works if the rider absorbs the cost.",
  "tension": "low",
  "focus": "wide"
}
```
**Decision log:**
- `tension: "low"` — this is still setup; the harm hasn't appeared yet
- `focus: "wide"` — sector-level view, zoomed out to the competitive landscape
- The final sentence of narration ("the arithmetic only works...") plants the tension for later beats — this is the craft of story encoding
- `node: "zepto"` makes Zepto the primary mesh for this beat in the canvas

---

## Encoded insight

```json
{
  "id": "ins-margin-extraction",
  "title": "Platform valuation growth is directly funded by worker earnings erosion",
  "body": "Zepto's $5B valuation and Blinkit's $13B valuation were achieved while simultaneously cutting rider base pay by 50%+ over three years. The negative gross margin model is only possible because the cost of delivery is shifted onto the worker's body, time, and vehicle.",
  "type": "paradox",
  "severity": "high",
  "evidence": ["zepto", "blinkit", "gig-rider", "earnings-erosion"]
}
```
**Decision log:**
- `type: "paradox"` — the contradiction is explicit: valuation rises *because* worker pay falls. This is not just a finding, it is a structural paradox.
- `title` is a declarative claim, not a label: it could be published as a headline and be understood
- `evidence[]` links to 4 nodes — the two platforms (cause) and the worker + metric (effect)
- This insight will auto-create a tetrahedron node in the graph with `reveals` edges to all 4 evidence nodes

---

## What NOT to do

**Bad node:**
```json
{ "id": "conditions", "label": "Working Conditions", "type": "default", "description": "" }
```
Problems: `type: "default"` is forbidden. Empty `description`. Abstract label without grounding.

**Good replacement:**
```json
{ "id": "extraction-conditions", "label": "Extraction Conditions", "type": "issue", "tier": "secondary", "sentiment": "negative", "description": "The combination of algorithmic time pressure, fuel costs, and traffic risk that structurally transfers platform costs onto the worker's body and income." }
```

**Bad story narration:**
```
"The workers face difficult conditions due to the platform system."
```
Problems: Passive. No specifics. No numbers. No entities named.

**Good replacement:**
```
"Zepto's algorithm assigns orders with 10-minute delivery windows. The arithmetic requires the rider to speed, skip red lights, and work 12+ hours to clear ₹500. 43% of workers now earn below that threshold. The algorithm has no face. There is no one to call."
```
