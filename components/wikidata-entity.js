AFRAME.registerComponent("wikidata-entity", {
  schema: {
    id: { default: "1" },
    label: { type: "string", default: "Entity" },
    description: { type: "string" },
    image_url: { type: "string" },
    claims: { type: "string" }
  },
  init: function() {
    var data = this.data;
    var el = this.el;

    // Create Main Entity
    this.parentEntity = document.createElement("a-box");
    this.el.appendChild(parentEntity);

    //Create Text Entity
    this.textEntity = document.createElement('a-text');
    this.el.appendChild(textEntity);

  },
  update: function() {
    let entityEl = this.parentEntity;

    // const positionString = `0 0 0`;
    // entityEl.setAttribute("position", positionString);
    entityEl.setAttribute("width", "2");
    entityEl.setAttribute("depth", "0.2");
    entityEl.setAttribute("height", "2");
    // entityEl.setAttribute('color','');
    entityEl.setAttribute("static-body", "true");
    entityEl.setAttribute("look-at", "#camera");
    entityEl.setAttribute("material", `src: url(${this.data.image_url})`);
    
   let textEntity = this.textEntity;
   textEntity.setAttribute("value", this.data.label);

  }
  // ...
});
