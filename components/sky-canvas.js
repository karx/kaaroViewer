AFRAME.registerComponent('sky-canvas', {
    schema: {default: ''},

    init: function () {
      console.log("InCanvas REady");
      var canvas = this.canvas = document.getElementById(this.data);
      var ctx = this.ctx = this.canvas.getContext('2d');
      var STAR_COLOURS = this.STAR_COLOURS = ["#ffffff", "#ffe9c4", "#d4fbff"], // because not all stars are white
      HEIGHT = 4096, // height of the canvas
      WIDTH = 4096; // width of the canvas
      // find the canvas and create its ctx
    
    // set up the width and height
      canvas.width = this.WIDTH =  WIDTH;
      canvas.height = this.HEIGHT = HEIGHT;

      // create a star field
      this.star_field(ctx, 300);
    },
    // create a new star field when you click on the canvas
    // canvas.addEventListener ("click", function () {
    //   star_field(ctx, 200);
    // }, false);
  
  /**
   * Generate a random integer between min and max
   */
  random: function(min, max) {
    return Math.round((Math.random() * max - min) + min);
  }, 
  
  /**
   * Generate a new star field with star_number stars and draw 
   * it onto the provided canvas ctx
   */
  star_field: function (ctx, star_number) {
    var x, // x position of the star
        y, // y position of the star
        brightness, // brightness of the star
        radius; // radius of the star
  
    // draw the blank night sky
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.WIDTH, this.HEIGHT);
    
    // save the previous canvas ctx state
    ctx.save();
    
    for (var i = 0; i < star_number; i++) {
      x = Math.random() * this.WIDTH; // random x position
      y = Math.random() * this.HEIGHT; // random y position
      radius = Math.random() * 1.1; // random radius
      brightness = this.random(80, 100) / 100;
  
      // start drawing the star
      ctx.beginPath();
      // set the brightness of the star
      ctx.globalAlpha = brightness;
      // choose a random star colour
      ctx.fillStyle = this.STAR_COLOURS[this.random(0, this.STAR_COLOURS.length)];
      // draw the star (an arc of radius 2 * pi)
      ctx.arc(x, y, radius, 0, Math.PI * 2, true);
      // fill the star and stop drawing it
      ctx.fill();
      ctx.closePath();
    }
    
    // restore the previous ctx state
    ctx.restore();
  }
  
  /**
   * Kick everything off
   */
  
  });

  