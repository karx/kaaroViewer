import instagram from './instagram';
const l = console.log;

async function boxSetter() {
    let theScene = document.getElementById("theScene");
    let newBox = document.createElement("a-box");
    // {
    newBox.setAttribute("position", "-1 10 -3");
    newBox.setAttribute("rotaion", "0 45 0");
    newBox.setAttribute("color", "#4CC3D9");
    newBox.setAttribute("height", "2");
    newBox.setAttribute("dynamic-body", true);
    // }
    
    theScene.appendChild(newBox);
    l("appended");
}
async function throwBoxEvery(delayInMs = 1000) {
   setInterval(() => {
       boxSetter();
   }, 1000);
}

async function main() {
    l("once i start. I begun");
    // throwBoxEvery();
}


document.addEventListener("DOMContentLoaded", function(event) {
    // - Code to execute when all DOM content is loaded. 
    // - including fonts, images, etc.
    main();

});