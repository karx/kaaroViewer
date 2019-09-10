AFRAME.registerComponent('sky-canvas', {
    schema: {default: ''},

    init: function () {
      console.log("InCanvas REady");
      this.canvas = document.getElementById(this.data);
      this.ctx = this.canvas.getContext('2d');
        var xMax = this.canvas.width = window.screen.availWidth;
        var yMax = this.canvas.height = window.screen.availHeight;
    
        var hmTimes = Math.round(xMax + yMax);	
        console.log(this.canvas);
        for(var i=0; i<=hmTimes; i++) {
          var randomX = Math.floor((Math.random()*xMax)+1);
          var randomY = Math.floor((Math.random()*yMax)+1);
          var randomSize = Math.floor((Math.random()*2)+1);
          var randomOpacityOne = Math.floor((Math.random()*9)+1);
          var randomOpacityTwo = Math.floor((Math.random()*9)+1);
          var randomHue = Math.floor((Math.random()*360)+1);
        if(randomSize>1) {
          this.ctx.shadowBlur = Math.floor((Math.random()*15)+5);
          this.ctx.shadowColor = "white";
          }
        this.ctx.fillStyle = "hsla("+randomHue+", 30%, 80%, ."+randomOpacityOne+randomOpacityTwo+")";
          this.ctx.fillRect(randomX, randomY, randomSize, randomSize);
        }
      
    }
  });