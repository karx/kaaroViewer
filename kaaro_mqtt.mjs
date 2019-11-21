var ID = function() {
    // Math.random should be unique because of its seeding algorithm.
    // Convert it to base 36 (numbers + letters), and grab the first 9 characters
    // after the decimal.
    return (
      "_" +
      Math.random()
        .toString(36)
        .substr(2, 9)
    );
  };
  var client = new Paho.Client(
    "api.akriya.co.in",
    8083,
    `clientId-91springboard_${ID}`
  );
  
  // set callback handlers
  client.onConnectionLost = onConnectionLost;
  client.onMessageArrived = onMessageArrived;
  
  // connect the client
  client.connect({ onSuccess: onConnect });
  
  // called when the client connects
  function onConnect() {
    // Once a connection has been made, make a subscription and send a message.
    console.log("onConnect");
    client.subscribe("kaaroEvents/dev1/presence");
    client.subscribe("kaaroEvents/dev1/nextPage");
    message = new Paho.Message("Hello");
    message.destinationName = "kaaroEvents/presence";
    client.send(message);
  }
  
  // called when the client loses its connection
  function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
      console.log("onConnectionLost:" + responseObject.errorMessage);
    }
  }
  
  // called when a message arrives
  function onMessageArrived(message) {
    console.log("onMessageArrived:" + message.payloadString);
  }
  
  function sendCustomMessage() {
    var messageValue = document.getElementById("message").value;
    console.log(messageValue);
    if (messageValue) {
      var message = new Paho.Message(messageValue);
      message.destinationName = "digitalicon/91springboards1/message";
      client.send(message);
      document.getElementById("message").value = "";
    }
  }
  
  