
let twitch_colors_accent_muted = ['#F0F0FF','#D2D2E6','#FAB4FF','#BFABFF','#FACDCD','#FC6675','#FEEE85','#FFCA5F','#BEFAE1','#57BEE6','#00C8AF','#0014A5'];
let twitch_colors_accent = ['#8205B4','#41145F','#FA1ED2','#BE0078','#FF6905','#FA2828','#FAFA19','#00FA05','#BEFF00','#69FFC3','#00FAFA','#1E69FF'];

let style = `
<style>
html, body, div, span, applet, object, iframe,
h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code,
del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var,
b, u, i, center,
dl, dt, dd, ol, ul, li,
fieldset, form, label, legend,
table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, 
figure, figcaption, footer, header, hgroup, 
menu, nav, output, ruby, section, summary,
time, mark, audio, video {
	margin: 0;
	padding: 0;
	border: 0;
	font-size: 100%;
	font: inherit;
	vertical-align: baseline;
}
/* HTML5 display-role reset for older browsers */
article, aside, details, figcaption, figure, 
footer, header, hgroup, menu, nav, section {
	display: block;
}
body {
	line-height: 1;
}
ol, ul {
	list-style: none;
}
blockquote, q {
	quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
	content: '';
	content: none;
}
table {
	border-collapse: collapse;
	border-spacing: 0;
}
/* End of reset */
body* > {
  box-sizing: border-box;
}
.card-container {
    border: 1px solid black;
    width: 500px;
    height: 700px;
    margin: 0 auto;
    /* margin-top: 56px; */
    border-radius: 25px;
    box-sizing: border-box;
    box-shadow: -8px 9px 16px -3px gray;
    background: #171314;  
}
 .card-background {
    height: 600px;
    margin: 20px 20px 0 20px;
    border-top-left-radius: 6px;
    border-top-right-radius: 6px;
    border-bottom-left-radius: 8%;
    border-bottom-right-radius: 8%;
    background-image: url(https://image.ibb.co/e1XKAS/green_background.jpg);
    background-repeat: no-repeat;
    background-size: cover;
    display: flex;
    background-color: #bbb;
    z-index: 0;
}

/*
    -------------------------
    -------------------------
            BORDERS
    -------------------------
    -------------------------
*/
.frame-header,
.frame-type-line {
    border-bottom: 4px solid #a9a9a9;
    border-left: 2px solid #a9a9a9;
    border-top: 1px solid #fff;
    border-right: 1px solid #fff;
}

.frame-header,
.frame-art,
.frame-type-line {
    box-shadow: 
        0 0 0 2px #171314,
        0 0 0 5px #26714A,
        -3px 3px 2px 5px #171314;

    margin-bottom: 7px;
}

.frame-text-box {
    box-shadow: 
        0 0 0 5px #26714A,
        -3px 3px 2px 5px #171314;
}

/*
    ----------------------
    ----------------------
            OVERFLOW
    ----------------------
    ----------------------
*/
.frame-header,
.frame-type-line,
.frame-text-box {
    overflow: hidden;
}


/*
  ----------------------------------------
  ----------------------------------------
            CARD FRAME
  ----------------------------------------
  ----------------------------------------
*/
.card-frame {
    z-index: 1;
    position: relative;
    height: 108%;
    max-width: 97%;
    left: 1%;
    top: 0.5%;
    left: 1.2%;
    display: flex;
    flex-direction: column;
}



.frame-header,
.frame-type-line {
    background: 
        linear-gradient( 0deg, rgba(201, 216, 201, .3), rgba(201, 216, 209, .3) ), 
        url(https://image.ibb.co/jKByZn/tile_bg_1.jpg);     
    display: flex;
    margin-top: 10px;
    margin-left: 5px;
    margin-right: 5px;
    padding: 8px 0;
    display: flex;
    justify-content: space-between;
    border-radius: 18px/40px;
}
/*
  Tue 27/3
*/
.name,
.type {
    font-size: 1.3em;
    margin-left: 10px;
    align-self: baseline;
    font-weight: 600;
}

#mana-icon {
    font-size: 2.3em;
    
    background: #ADD3AC;
    border-radius: 40%;
    box-sizing: border-box;
    box-shadow: -0.05em 0.02em 0px 0 black;
    margin: 10px;
    height: 45px;
    align-self: center;
    padding:4px;
}
.frame-art {
    height: 50%;
    display: flex;
    align-items: center;
    justify-content: center;   
    overflow: hidden;
}
.frame-art-inner {
    height: 100%;

}

#set-icon {
    /* height: 9%; */
    width: 6%;
    overflow: hidden;
    margin-right: 10px;
    align-self: center;
} 
.frame-type-line {
    margin-top: 0;
} 

.frame-text-box {
    margin: 0 10px;
    background: #d3ded6;
    background-image: url(https://image.ibb.co/dFcNx7/tile_bg_2.jpg);
    display: flex;
    flex-direction: column;
    justify-content: space-around;    
    padding: 50px 6px;
    font-size: 1.2em;
}

.flavour-text {
    font-style: italic;
    padding: 10px 0;
}

p {
    margin-bottom: 5px;
}

.ftb-inner-margin {
    margin: 5px 1px;
}





.frame-bottom-info {
    color: white;
    display: flex;
    justify-content: space-between;
    margin: 5px 15px 0 15px; 
}

fbi-left {
    flex: 1;
} 
.fbi-left p:first-of-type {
    margin-bottom: 1px;
}
.fbi-left,
.fbi-right {
    font-size: 10px;
    position: relative;
    top: 6px;
}

.fbi-center {
    border-radius: 60%;
    flex-basis: 41px;
    height: 21px;
    position: relative;
    bottom: 11px;
    z-index: 2;
    background: lightgray;
    background-image: url(https://image.ibb.co/jyq34n/holofoil_texture_2.jpg);
    box-shadow: 
        0 0 0 4px #171314;
}
.inner-margins {
    margin: 0 10px;
} */  




.fbi-right {
    flex: 1;
    text-align: right;
}
 .frame-bottom-info img {
    overflow: hidden;
    max-width: 10px;
}

.scoreboard-container{
    width: 100%;
    height: 100%;
}

.scoreboard-label {
    text-align: center;
}

.scoreValues {
    width: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
}
.eachPlayer {
    padding: 10px;
    display: flex;
    flex-direction: row;
    justify-content: center;
    align-items: center;
}


.labelVal {
    transform: skew(20deg, 0);
    background-color: blue;
    padding: 10px 20px;
    border-radius: 10px 10px 10px 10px;
    margin: 0 10px;
    width: 200px;
    overflow: hidden;
    text-align: center;
}
.labelVal div {
    transform: skew(-20deg, 0);
}

.numVal {
    transform: skew(20deg, 0);
    background-color: darkslateblue;
    padding: 10px 20px;
    border-radius: 10px 10px 10px 10px;
    width: 70px;
    overflow: hidden;
    text-align: center;

}
</style>
`
let lastUsedColorIndex = 0;
class BasicWebComponent extends HTMLElement {
  schema = {
    'label': {type: 'string', default: 'Player'},
    'instanceof': {type: 'string', default: 'Player'},
    'image_url': {type: 'string', default: '2'},
  }
  constructor() {
    super(); // this is mandatory
    console.log(this.schema);
  }
  connectedCallback() {
    this.data = {};
    this.data.playerName = this.getAttribute('label') || this.schema.label.default;
    this.data.label = this.getAttribute('instanceof') || this.schema.instanceof.default;
    this.data.img_src = this.getAttribute('image_url') || this.schema.img_src.default;
    if (!!this.data.img_src && this.data.img_src.length > 0) {
        console.log(this.data.img_src);
        console.log(typeof this.data.img_src);
        this.data.img_src = this.data.img_src.includes(".svg") ? this.data.img_src + '.png' : this.data.img_src;
    }

    const rootElem = document.createElement('div');
    rootElem.classList='eachScoreboard';
    rootElem.innerHTML = `
    ${style}
    <div class="card-container">
        <div class="card-background">
        <div class="card-frame">
            <div class="frame-header">
            <h1 class="name" id="playerName">${this.data.playerName}</h1>
            
                <img
                src="https://image.ibb.co/kzaLjn/OGW_R.png"
                id="set-icon"
                alt="OGW-icon"
            />
            </div>

            <div class="frame-art" id="chart_div">
                <img
                    class="frame-art-inner"
                    src="${this.data.img_src}"
                />
            </div>

            <div class="frame-type-line">
            <h1 class="type">${this.data.label}</h1>
            <!-- <img
                src="https://image.ibb.co/kzaLjn/OGW_R.png"
                id="set-icon"
                alt="OGW-icon"
            /> -->
            </div>

            <div class="frame-text-box">
            <p class="description ftb-inner-margin">
                
            </p>
            <p class="description" id="desc-card">
                Loading stats..
            </p>
            <p class="flavour-text">
                "Appear weak when you are strong, and strong when you are weak"
            </p>
            </div>

            <div class="frame-bottom-info inner-margin">
            <div class="fbi-left">
                <p>140/184 R</p>
                <p>
                OGW &#x2022; EN
                
                kaaroPlayers
                </p>
            </div>

            <div class="fbi-center"></div>

            <div class="fbi-right">
                &#x99; &amp; &#169; Powered by Wikidata
            </div>
            </div>
        </div>
        </div>
    </div>`;

    let shadowRoot = this.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(rootElem);

  }

  attributeChangedCallback(attr, oldVal, newVal) {
  }
  
}

// BasicWebComponent.observedAttributes = ['game', 'post', 'token'];

customElements.define('tcg-card', BasicWebComponent);