

// Base background color
const pastelBG = "#F7F3FF";      

// Text color for UI
const pastelText = "#4A4458";    

// Overlay colors for lamp states
const overlayStart = "rgba(180, 255, 200, 0.35)";  
const overlayPause = "rgba(180, 210, 255, 0.35)";  
const overlayEnd   = "rgba(200, 200, 200, 0.25)";  




// SERIAL CONFIG


// Baud rate for Arduino communication
const BAUD_RATE = 9600;

// Serial port + connect button reference
let port, connectBtn;



// Current lamp mode
let mode = "OFF"; 

// Current UI state
let state = "ASK_STUDY"; 

// Option lists for study, break, sessions
let studyOptions   = [15, 20, 25, 30, 45, 60];
let breakOptions   = [3, 5, 10, 15];
let sessionOptions = [1, 2, 3, 4, 5, 6];

// Indexes for selected options
let studyIndex = 0;
let breakIndex = 0;
let sessionIndex = 0;

// Session tracking
let totalSessions = 0;
let currentSession = 0;




// TIMER


// Countdown timer value
let timer = 0;

// Whether timer is active
let timerRunning = false;




// BUTTONS


// UI button references
let selectBtn, startBtn, pauseBtn, endBtn;
let plusBtn, minusBtn;




// SETUP

function setup() {

  // Create Connect button (always on top)
  connectBtn = createButton("Connect to Arduino");
  connectBtn.position(10, 10);
  connectBtn.class("connect");
  connectBtn.mouseClicked(onConnectButtonClicked);

  // Initialize serial system
  setupSerial();

  // Create canvas behind UI
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.style("z-index", "-1");

  // Text styling for p5 UI
  textFont("system-ui", 45);
  textStyle(BOLD);
  textAlign(CENTER, CENTER);


  //BUTTONS FOR THE TIMER AND ADJUSTING DIFFERENT PARTS OF THE SESSION


  // Minus button
  minusBtn = createButton("–");
  minusBtn.parent("ui-container");
  minusBtn.mouseClicked(() => adjustValue(-1));

  // Plus button
  plusBtn = createButton("+");
  plusBtn.parent("ui-container");
  plusBtn.mouseClicked(() => adjustValue(1));

  // Select button
  selectBtn = createButton("Select");
  selectBtn.parent("ui-container");
  selectBtn.mouseClicked(() => handleSelect());

  // Start button
  startBtn = createButton("Start");
  startBtn.parent("ui-container");
  startBtn.mouseClicked(() => sendCommand("START"));

  // Pause button
  pauseBtn = createButton("Pause");
  pauseBtn.parent("ui-container");
  pauseBtn.mouseClicked(() => sendCommand("PAUSE"));

  // End button
  endBtn = createButton("End");
  endBtn.parent("ui-container");
  endBtn.mouseClicked(() => sendCommand("END"));
}



// DRAW LOOP

function draw() {

  // Update connect button label
  const portIsOpen = checkPort();  

  // Draw background
  background(pastelBG);

  // Draw lamp overlay
  noStroke();
  if (mode === "START") fill(overlayStart);
  else if (mode === "PAUSE") fill(overlayPause);
  else fill(overlayEnd);
  rect(0, 0, width, height);

  // Read incoming serial messages
  readSerialMessages();

  // Draw UI text
  drawUI();



  // POMODLIGHT TIMER 


  // Update timer once per second
  if (timerRunning && frameCount % 60 === 0) {
    timer--;

    // When timer hits zero
    if (timer <= 0) {
      timerRunning = false;

      // Switch from study to break
      if (state === "RUNNING") {
        state = "BREAK";
        timer = breakOptions[breakIndex] * 60;
        timerRunning = true;
        sendCommand("PAUSE");
      } 

      // Switch from break to next session or done
      else if (state === "BREAK") {
        currentSession++;

        if (currentSession < totalSessions) {
          state = "RUNNING";
          timer = studyOptions[studyIndex] * 60;
          timerRunning = true;
          sendCommand("START");
        } else {
          state = "DONE";
          sendCommand("END");
        }
      }
    }
  }
}




// UI RENDERING

function drawUI() {

  // Set text color
  fill(pastelText);

  // Study duration selection
  if (state === "ASK_STUDY") {
    text("Study Duration:", width/2, height/2 - 40);
    text(studyOptions[studyIndex] + " minutes", width/2, height/2);
    return;
  }

  // Break duration selection
  if (state === "ASK_BREAK") {
    text("Break Duration:", width/2, height/2 - 40);
    text(breakOptions[breakIndex] + " minutes", width/2, height/2);
    return;
  }

  // Session count selection
  if (state === "ASK_SESSIONS") {
    text("Number of Sessions:", width/2, height/2 - 40);
    text(sessionOptions[sessionIndex], width/2, height/2);
    return;
  }

  // Ready screen
  if (state === "READY") {
    text("Ready to Start", width/2, height/2 - 40);
    text("Press Start or Remote Button 1", width/2, height/2);
    return;
  }

  // Running or break timer
  if (state === "RUNNING" || state === "BREAK") {
    let mins = floor(timer / 60);
    let secs = timer % 60;
    text(nf(mins, 2) + ":" + nf(secs, 2), width/2, height/2);
    text(`Session ${currentSession + 1} of ${totalSessions}`, width/2, height/2 + 60);
    return;
  }

  // Completion screen
  if (state === "DONE") {
    text("All Sessions Complete!", width/2, height/2);
    return;
  }
}




// VALUE ADJUSTMENT

function adjustValue(dir) {

  // Adjust study duration
  if (state === "ASK_STUDY") {
    studyIndex = (studyIndex + dir + studyOptions.length) % studyOptions.length;
  }

  // Adjust break duration
  if (state === "ASK_BREAK") {
    breakIndex = (breakIndex + dir + breakOptions.length) % breakOptions.length;
  }

  // Adjust session count
  if (state === "ASK_SESSIONS") {
    sessionIndex = (sessionIndex + dir + sessionOptions.length) % sessionOptions.length;
  }
}



// SELECT BUTTON LOGIC
function handleSelect() {

  // Move through setup states
  if (state === "ASK_STUDY") state = "ASK_BREAK";
  else if (state === "ASK_BREAK") state = "ASK_SESSIONS";
  else if (state === "ASK_SESSIONS") {

    // Store total sessions
    totalSessions = sessionOptions[sessionIndex];
    currentSession = 0;

    // Move to ready state
    state = "READY";
  }
}




// SERIAL COMMUNICATION

function readSerialMessages() {

  // Read incoming line
  let str = port.readUntil("\n");
  if (str.length === 0) return;

  // Clean string
  str = str.trim();
  console.log("Incoming:", str);

  // Remote START
  if (str === "START") {
    mode = "START";
    if (state === "READY" || state === "BREAK") {
      state = "RUNNING";
      timer = studyOptions[studyIndex] * 60;
      timerRunning = true;
    }
  }

  // Remote PAUSE
  if (str === "PAUSE") {
    mode = "PAUSE";
    if (state === "RUNNING") {
      state = "BREAK";
      timer = breakOptions[breakIndex] * 60;
      timerRunning = true;
    }
  }

  // Remote END
  if (str === "END") {
    mode = "END";
    timerRunning = false;
    if (state !== "DONE") state = "READY";
  }
}




// SEND COMMANDS TO ARDUINO
function sendCommand(cmd) {

  // Only send if port is open
  if (port.opened()) {
    port.write(cmd + "\n");
    console.log("Sent:", cmd);

    // Local UI updates for START
    if (cmd === "START") {
      state = "RUNNING";
      timer = studyOptions[studyIndex] * 60;
      timerRunning = true;
    }

    // Local UI updates for PAUSE
    if (cmd === "PAUSE") {
      state = "BREAK";
      timer = breakOptions[breakIndex] * 60;
      timerRunning = true;
    }

    // Local UI updates for END
    if (cmd === "END") {
      timerRunning = false;
      state = "READY";
    }
  }
}




// SERIAL SETUP

function setupSerial() {

  // Create serial object
  port = createSerial();

  // Auto‑reconnect to last used port
  let used = usedSerialPorts();
  if (used.length > 0) {
    port.open(used[0], BAUD_RATE);
  }
}



// CHECK PORT STATUS
function checkPort() {

  // If not open, show connect
  if (!port.opened()) {
    connectBtn.html("Connect to Arduino");
    return false;
  }

  // If open, show disconnect
  connectBtn.html("Disconnect");
  return true;
}




// CONNECT BUTTON HANDLER

function onConnectButtonClicked() {

  // Toggle port open/close
  if (!port.opened()) port.open(BAUD_RATE);
  else port.close();
}
