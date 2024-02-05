var gameData = items.list;

var config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    audio: {
        disableWebAudio: true
    }
};

var game = new Phaser.Game(config);
var audioIndex = {};
var sprites = {};
var background;
var currentSound = null;
var textDisplay;
var gameTimer; // Timer to track game duration
var isGameOver = false; // Flag to track if the game is over
var gameStartTimestamp = new Date().getTime(); // Timestamp when the game starts
var firstInteractionTimestamp = null; // Timestamp of the first user interaction
var totalListeningTime = 0; // Total time spent listening to audios
var currentAudioStartTime = null; // Timestamp when the current audio starts
var potentialDragStartLog = null; // Object to store the potential dragstart log data
var dragStartPositions = {}; // Object to store the start positions of sprites
var questionsOrder = []; 
var correctAnswersCount = 0; //  tracking the number of correct answers 
var audioCounts = {
    'animals': 0,
    'body': 0,
    'environment': 0,
    'food': 0,
    'history': 0,
    'internet': 0,
    'media': 0,
    'music': 0,
    'space': 0
};

var transitionMatrix = {};
var lastCategoryHeard = null;
var userLogs = [];
var currentDraggedSprite = null;

// initialize the transition matrix to 0's
for (let category1 in gameData){
    transitionMatrix[category1] = {};
    for (let category2 in gameData){
        transitionMatrix[category1][category2] = 0;
    }
}

var userDocRef; // Global variable to store the user document reference

function preload() {
    this.load.image('background', window.assetsBaseUrl + 'images/background_image.png');

    for (let category in gameData) {
        this.load.atlas(category, window.assetsBaseUrl + 'images/' + category + '.png', window.assetsBaseUrl + 'images/' + category + '.json');
        for (let i = 1; i <= Object.keys(gameData[category].text).length; i++) {
            this.load.audio(`${category}_${i}`, [window.assetsBaseUrl + 'audio/' + gameData[category].text[i].audio]);
        }
        audioIndex[category] = 1;
    }
}

function create() {
    background = this.add.image(this.scale.width / 2, this.scale.height / 2, 'background').setOrigin(0.5, 0.5);
    resizeBackground();

    for (let category in gameData) {
        this.anims.create({
            key: `${category}Anim`,
            frames: this.anims.generateFrameNames(category, {
                prefix: 'Idle_',
                start: 1,
                end: 12,
                zeroPad: 1,
                suffix: '.png'
            }),
            frameRate: 6,
            repeat: -1
        });

        let catData = gameData[category];
        let sprite = this.add.sprite(
            this.scale.width * catData.pos.x,
            this.scale.height * catData.pos.y,
            category
        ).setInteractive();
        sprite.name = category;
        var iconScale = Math.min(this.scale.width, this.scale.height) / 500; // Adjust the denominator to fit your needs
        sprite.setScale(iconScale * 0.3); 

        // Add category name text below the icon
        var fontSize = this.scale.height * 0.03; // 2% of screen height
        var categoryText = this.add.text(
            sprite.x - (items['list'][category]['label'].length * fontSize / 6.0),
            sprite.y + sprite.displayHeight / 3.0 , // Position below the icon
            catData.label,
            { font: `bold ${fontSize}px Arial`, fill: "#000", align: "center" }
        ).setOrigin(0.5, 0);
        sprite.categoryText = categoryText; // Link text to sprite
        
        this.input.setDraggable(sprite);
        sprites[category] = sprite;
        // Add pointer down event listener for logging
        sprite.on('pointerdown', function(pointer) {
            logUserAction('clicked', pointer.x, pointer.y, category);
        });
        sprite.on('pointerdown', () => playAudioForCategory(this, category));
    }

    // Add drag start and drag end event listeners for logging
    this.input.on('dragstart', function(pointer, gameObject) {
        // Create potential dragstart log data
        var timestamp = (new Date().getTime() - gameStartTimestamp) / 1000;
        potentialDragStartLog = {
            action: 'dragstart',
            timestamp: timestamp,
            location: { x: pointer.x, y: pointer.y },
            category: gameObject.name
        };

        // Store the starting position of the sprite
        dragStartPositions[gameObject.name] = { x: gameObject.x, y: gameObject.y };
        currentDraggedSprite = gameObject;
    });

    this.input.on('dragend', function(pointer, gameObject) {
        // Calculate the distance moved
        var startPos = dragStartPositions[gameObject.name];
        var distanceMoved = Phaser.Math.Distance.Between(startPos.x, startPos.y, gameObject.x, gameObject.y);
        var dragThreshold = 10;

        // Check if the distance moved is greater than the threshold
        if (distanceMoved > dragThreshold) {
            // Log the potential dragstart and the dragend actions
            if (potentialDragStartLog) {
                userLogs.push(potentialDragStartLog);
            }

            var timestamp = (new Date().getTime() - gameStartTimestamp) / 1000;
            logUserAction('dragend', pointer.x, pointer.y, gameObject.name, timestamp);
        }

        currentDraggedSprite = null;
        potentialDragStartLog = null;
        delete dragStartPositions[gameObject.name]; // Clear the stored position
    });

    this.input.on('drag', function(pointer, gameObject, dragX, dragY) {
        var dx = gameObject.x - dragX;
        var dy = gameObject.y - dragY

        gameObject.x = dragX;
        gameObject.y = dragY;

        // Update position of the category name text
        if (gameObject.categoryText) {

            gameObject.categoryText.x -= dx;
            gameObject.categoryText.y -= dy 
        }
    });

    // Initialize text display
    var fontSize = this.scale.height * 0.04; 
    textDisplay = this.add.text(
        this.scale.width / 2,
        this.scale.height * 0.8, 
        '', 
        { font: "bold "+ fontSize+ "px Arial", fill: "#000", boundsAlignH: "center", boundsAlignV: "middle", wordWrap: true, wordWrapWidth: 300, maxLines: 3, align: "center" }
    ).setOrigin(0.5, 0);
    window.addEventListener('resize', () => resizeGame(this));

    // Start a timer for 2 minutes to end the game
    gameTimer = this.time.addEvent({
        delay: 120000, 
        callback: onTimerComplete,
        callbackScope: this
    });
}

function update() {
    // Game logic goes here
}

function resizeGame(scene) {
    var w = window.innerWidth;
    var h = window.innerHeight;
    scene.scale.resize(w, h);
    resizeBackground();
}

function resizeBackground() {
    if (background) {
        var w = game.scale.width;
        var h = game.scale.height;
        background.displayWidth = w;
        background.displayHeight = h;
    }
}

function playAudioForCategory(scene, category) {
    if (currentSound && currentSound.isPlaying) {
        return;
    }

    // Track the first interaction time
    if (!firstInteractionTimestamp) {
        firstInteractionTimestamp = new Date().getTime();
    }
    currentAudioStartTime = new Date().getTime(); // Mark the start time of the audio

    audioCounts[category]++; // Increment the count for the category

    // Update transition matrix
    if (lastCategoryHeard && lastCategoryHeard !== category) {
        transitionMatrix[lastCategoryHeard][category]++;
    }
    lastCategoryHeard = category;

    // When adding a question to questionsOrder, ensure it doesn't exceed 10 items
    if (questionsOrder.length < 10) {
        questionsOrder.push({
            category: category,
            questionIndex: audioIndex[category]
        });
    }

    logUserAction('audiostart', null, null, category); // Log audio start

    let index = audioIndex[category];
    currentSound = scene.sound.add(`${category}_${index}`);
    currentSound.play();

    let textData = gameData[category].text[index];
    textDisplay.setText(textData.text);

    let sprite = sprites[category];
    sprite.anims.play(`${category}Anim`);

    currentSound.once('complete', function() {
        logUserAction('audioend', null, null, category); // Log audio end
        sprite.anims.stop();
        sprite.setFrame(0); 
        currentSound = null;
        textDisplay.setText(''); 
        var audioEndTime = new Date().getTime();
        totalListeningTime += audioEndTime - currentAudioStartTime;

        if (isGameOver) {
            gameOver.call(scene);
        }
    });

    audioIndex[category] = index < Object.keys(gameData[category].text).length ? index + 1 : 1;

}

function onTimerComplete() {
    isGameOver = true;
    if (!currentSound || !currentSound.isPlaying) {
        gameOver.call(this);
    }
}


var currentQuestionIndex = 0; //  global variable for the current question index

function displayTest() {
    displayQuestion(currentQuestionIndex);
}

function displayQuestion(index) {
    var testContainer = document.getElementById('testContainer');
    testContainer.innerHTML = ''; // Clear existing content

    var item = questionsOrder[index];
    var category = item.category;
    var questionIndex = item.questionIndex;
    var questionData = items.questions[category][questionIndex];

    // Create and display the question and answers
    var questionElement = document.createElement('div');
    questionElement.className = 'question';
    var questionText = document.createElement('p');
    questionText.textContent = questionData.question;
    questionElement.appendChild(questionText);

    // Create a container for the answer options
    var answersContainer = document.createElement('div');

    Object.keys(questionData.answers).forEach(answerKey => {
        var answerLabel = document.createElement('label');
        answerLabel.className = 'answerLabel';
        var answerInput = document.createElement('input');
        answerInput.type = 'radio';
        answerInput.name = `question-${category}-${questionIndex}`;
        answerInput.value = answerKey;
        answerLabel.appendChild(answerInput);
        answerLabel.appendChild(document.createTextNode(' ' + questionData.answers[answerKey]));
        answersContainer.appendChild(answerLabel);
        answersContainer.appendChild(document.createElement('br'));
    });

    questionElement.appendChild(answersContainer);
    testContainer.appendChild(questionElement);

    // Always add a Next button, even for the last question
    var nextButton = document.createElement('button');
    nextButton.textContent = 'Next';
    nextButton.addEventListener('click', function() {
        // Disable the Next button to prevent multiple clicks
        nextButton.disabled = true;

        // Check which answer was selected
        var selectedAnswer = document.querySelector(`input[name="question-${category}-${questionIndex}"]:checked`);

        // Style the correct answer in green
        var correctAnswerInput = document.querySelector(`input[name="question-${category}-${questionIndex}"][value="${questionData.correct}"]`);
        var correctAnswerLabel = correctAnswerInput ? correctAnswerInput.parentNode : null;
        if (correctAnswerLabel) {
            correctAnswerLabel.style.backgroundColor = 'lightgreen';
        }

        if (selectedAnswer){
            if(selectedAnswer.value !== questionData.correct){
                // If the selected answer is not the correct answer, style it in red
                selectedAnswer.parentNode.style.backgroundColor = 'lightcoral';
            }
            // Check if the selected answer is correct and increment correctAnswersCount
            if (selectedAnswer.value === questionData.correct) {
                correctAnswersCount++;
            }

        }

        // Wait for 2 seconds to show the answer feedback
        setTimeout(function() {
            // Increment question index or show finished message if on the last question
            currentQuestionIndex++;
            if (currentQuestionIndex < questionsOrder.length) {
                // If there are more questions, go to the next one
                displayQuestion(currentQuestionIndex);
            } else {

                if (userDocRef) {

                    // Update the quiz results in Firestore
                    var questionnaireData = {
                        correctAnswers: correctAnswersCount,
                        totalQuestions: questionsOrder.length
                    };
                    updateUserDataWithQuestionnaire(questionnaireData);

                    const research = getResearchParameter();
                    if (research== 'CM'){
                        sendGameCompletionToServer()
                    }
                    else {
                        // any other research should be routed to end game page with option to copy UUID
                        displayGameOverMessage(userDocRef.id);
                    }
                }
            }
        }, 2000);
    });

    testContainer.appendChild(nextButton);
    testContainer.style.display = 'block';
}

function updateUserDataWithQuestionnaire(questionnaireData) {
    if (userDocRef) {
        const db = window.getFirestore(window.app);
        window.updateDoc(userDocRef, questionnaireData)
            .then(() => console.log("Questionnaire data updated in Firestore"))
            .catch((error) => console.log("Firestore update failed: ", error.message));
    } else {
        console.log("No user document reference found for updating questionnaire data.");
    }
}

function logUserAction(actionName, x, y, category) {
    var timestamp = (new Date().getTime() - gameStartTimestamp) / 1000;
    var logEntry = {
        action: actionName,
        timestamp: timestamp,
        location: x !== null && y !== null ? { x: x, y: y } : null,
        category: category || null,
        audio_playing: currentSound && currentSound.isPlaying ? currentDraggedSprite.name : false
    };
    userLogs.push(logEntry);
}

function gameOver() {
    // Stop all audio and animations
    if (currentSound && currentSound.isPlaying) {
        currentSound.stop();
    }

    for (let category in sprites) {
        let spriteContainer = sprites[category];
        spriteContainer.anims.stop();

        // Hide the sprite and its associated text
        spriteContainer.setVisible(false);
        if (spriteContainer.categoryText) {
            spriteContainer.categoryText.setVisible(false);
        }
    }

    // Hide all sprites
    for (let category in sprites) {
        sprites[category].setVisible(false);
    }

    // If an audio is currently playing, add its duration to the total listening time
    if (currentSound && currentSound.isPlaying) {
        var audioEndTime = new Date().getTime();
        totalListeningTime += audioEndTime - currentAudioStartTime;
        currentSound.stop();
    }

    if (firstInteractionTimestamp === null) {
        const research = getResearchParameter();
        if (research== 'CM'){
            sendGameCompletionToServer()
        }
        else {
            // User did not interact, display message with "XXXXXX"
            displayGameOverMessage("XXXXXX");
        }
        
    } else {
        // Calculate normalized listening time
        var gameEndTime = new Date().getTime();
        var playingTime = gameEndTime - (firstInteractionTimestamp || gameStartTimestamp);
        var normalizedListeningTime = playingTime > 0 ? totalListeningTime / playingTime : 0;
        console.log("Normalized Listening Time: " + normalizedListeningTime);

        // Calculate hearing percentages and diversity entropy
        var totalAudios = Object.values(audioCounts).reduce((a, b) => a + b, 0);
        var h_m = 0;
        var numCategoriesHeard = Object.values(audioCounts).filter(count => count > 0).length;
    
        for (let category in audioCounts) {
            var p_i = totalAudios > 0 ? audioCounts[category] / totalAudios : 0;
            if (p_i > 0) {
                h_m += -p_i * Math.log2(p_i);
            }
        }
    
        // Calculate maximum diversity with discrete uniform distribution
        var h_m_max = 0;
        if (numCategoriesHeard > 0) {
            var baseShare = Math.floor(totalAudios / numCategoriesHeard);
            var extraAudios = totalAudios % numCategoriesHeard;
            for (let i = 0; i < numCategoriesHeard; i++) {
                var p_i_max = (i < extraAudios) ? (baseShare + 1) / totalAudios : baseShare / totalAudios;
                h_m_max += -p_i_max * Math.log2(p_i_max);
            }
        }
    
        // Calculate normalized multi-disciplinary entropy
        var normalizedEntropy = h_m_max > 0 ? h_m / h_m_max : 0;
        console.log("Normalized Multi-Disciplinary Entropy: " + normalizedEntropy);

        // Calculate the normalized transition probability matrix (P)
        var totalTransitions = 0;
        for (let category1 in transitionMatrix) {
            for (let category2 in transitionMatrix[category1]) {
                totalTransitions += transitionMatrix[category1][category2];
            }
        }

        var transitionProbabilityMatrix = {};
        for (let category1 in transitionMatrix) {
            transitionProbabilityMatrix[category1] = {};
            for (let category2 in transitionMatrix[category1]) {
                transitionProbabilityMatrix[category1][category2] = totalTransitions > 0 ? transitionMatrix[category1][category2] / totalTransitions : 0;
            }
        }

        // Compute the transition entropy (H_t)
        var H_t = 0;
        for (let category1 in transitionProbabilityMatrix) {
            for (let category2 in transitionProbabilityMatrix[category1]) {
                let p_ij = transitionProbabilityMatrix[category1][category2];
                if (p_ij > 0) {
                    H_t += -p_ij * Math.log2(p_ij);
                }
            }
        }

        // Calculate the maximum transition entropy (H_t_max)
        var H_t_max = 0;
        if (numCategoriesHeard > 0) {
            // The possible transitions is a matrix of all the categories heard minus the diagonal (i->i). 
            // for example: if 3 categories were heard then there are 3^2-3=6 possible transitions: 1-2, 1-3, 2-1, 2-3, 3-1,3-2
            var possibleTransitions= numCategoriesHeard**2 - numCategoriesHeard;
            if (possibleTransitions > totalTransitions){
                H_t_max= -Math.log2(1/totalTransitions);
            }
            else{
                var baseShare = Math.floor(totalTransitions / possibleTransitions);
                var extraTransitions = totalTransitions % possibleTransitions;
                for (let i = 0; i < possibleTransitions; i++) {
                    var p_i_j_max = (i < extraTransitions) ? (baseShare + 1) / totalTransitions : baseShare / totalTransitions;
                    h_m_max += -p_i_j_max * Math.log2(p_i_j_max);
                }
            }
        }

        // Step 5: Calculate and print the normalized transition entropy
        var normalizedTransitionEntropy = H_t_max > 0 ? H_t / H_t_max : 0;
        console.log("Normalized Transition Entropy: " + normalizedTransitionEntropy);

        // Prepare the game data to be saved
        var gameData = {
            LT_1: normalizedListeningTime,
            MDE_2: normalizedEntropy,
            TE_3: normalizedTransitionEntropy,
            logs: userLogs,
            timestamp: window.serverTimestamp()
        };
        
        saveGameDataToFirebase(gameData); 
        displayTest();
    }
}

// find the research name (CuriosityMAP= CM, any other research name will be in the URL as a parameter)
function getResearchParameter() {
    return window.researchName || 'defaultResearch';
}

function saveGameDataToFirebase(gameData) {
    const researchName = getResearchParameter();
    const db = window.getFirestore(window.app);
    const UserTable = window.collection(db, researchName);
    window.addDoc(UserTable, gameData)
        .then((docRef) => {
            console.log("Game data saved to Firestore with ID: ", docRef.id);
            userDocRef = docRef; // Store the document reference for later use
        })
        .catch((error) => console.log("Firestore save failed: ", error.message));
}

function createCopyIDBox(userDocRef) {
    var idContainer = document.createElement('div');
    idContainer.style.display = 'flex';
    idContainer.style.alignItems = 'center';
    idContainer.style.justifyContent = 'center';
    idContainer.style.marginTop = '20px';

    var idBox = document.createElement('input');
    idBox.type = 'text';
    idBox.value = userDocRef.id;
    idBox.readOnly = true;
    idBox.style.padding = '10px';
    idBox.style.marginRight = '10px';
    idBox.style.width = '200px';

    var copyButton = document.createElement('button');
    copyButton.textContent = 'Copy';
    copyButton.style.backgroundColor = 'purple'; // Set button color to purple
    copyButton.style.color = 'white'; // Set text color to white for better visibility
    copyButton.style.padding = '10px 20px';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '5px';
    copyButton.style.cursor = 'pointer';
    copyButton.onclick = function() {
        idBox.select();
        document.execCommand('copy');
    };

    idContainer.appendChild(idBox);
    idContainer.appendChild(copyButton);

    return idContainer;
}

function displayGameOverMessage(userId) {
    var testContainer = document.getElementById('testContainer');
    testContainer.innerHTML = ''; // Clear the container
    var finishedText = document.createElement('p');
    finishedText.style.textAlign = 'center';
    finishedText.style.fontWeight = 'bold';
    finishedText.style.fontSize = '24px';
    finishedText.textContent = "Game Over. \nPlease copy the ID below and paste it into the qualtrics survey";
    testContainer.appendChild(finishedText);

    var idBoxContainer = createCopyIDBox({ id: userId });
    testContainer.appendChild(idBoxContainer);

    // Center the message in the container
    testContainer.style.display = 'flex';
    testContainer.style.flexDirection = 'column';
    testContainer.style.justifyContent = 'center';
    testContainer.style.alignItems = 'center';
}

function sendGameCompletionToServer() {
    fetch('/update_child_game_completion', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            // send the log ID from free_exploration_game DB ad the child id of the child playing 
            gameLogID: userDocRef.id,
            childID: window.childId
        })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Success:', data);
        window.location.href = "/parents_homepage"; // Redirect after successful update
    })
    .catch((error) => {
        console.error('Error:', error);
    });
}


