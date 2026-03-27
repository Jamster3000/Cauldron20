// chromeium cauldronNewCharacter.js

setTimeout(function () {
    const nameInput = document.querySelectorAll('#name')[1];
    const hitPoints = document.getElementById('hitpoints');
    const armourClass = document.getElementById('armor_class');
    const initiative = document.getElementById('initiative');
    const thirdRadioButton = document.querySelector('.radio-group input[value="url"]');
    const sheetURL = document.querySelector('.sheet_url');
    const radioButtons = document.querySelectorAll('.radio-group input[name="sheet"]');
    const urlInput = document.getElementById('sheet_url');

    //add button to the button where cancel and save are
    const newButton = document.createElement('button');
    newButton.textContent = 'Auto Fill';
    newButton.classList.add('btn', 'btn-default');
    const btnGroup = document.querySelector('.btn-group');
    btnGroup.appendChild(newButton);

    //checkes the url remote file radio button
    if (thirdRadioButton) {
        thirdRadioButton.checked = true;
        sheetURL.style = "";
    }

    //shows the correct div for the correct radio button checked
    radioButtons.forEach(function (radioButton) {
        radioButton.addEventListener('change', function () {
            if (radioButton.value === 'url' && radioButton.checked) {
                sheetURL.style.display = 'block';
            } else {
                sheetURL.style.display = 'none';
            }
        });
    });

    const initialCheckedRadioButton = document.querySelector('.radio-group input[name="sheet"]:checked');
    if (initialCheckedRadioButton && initialCheckedRadioButton.value === 'url') {
        sheetURL.style.display = 'block';
    } else {
        sheetURL.style.display = 'none';
    }

    // First, try to get the activeCharacterId and characters collection
    chrome.storage.local.get(['activeCharacterId', 'characters', 'characterData'], function (result) {
        // Create a character selector dropdown if we have multiple characters
        if (result.characters && Object.keys(result.characters).length > 0) {
            createCharacterSelector(result.characters, result.activeCharacterId, result.characterData);
        } else if (result.characterData) {
            // If no characters collection but we have characterData, use that
            setupWithCharacterData(result.characterData);
        } else {
            // No character data found
            if (btnGroup) {
                newButton.disabled = true;
                newButton.title = "No character data available";
            }
        }
    });

    function setupWithCharacterData(characterData) {
        // Use the provided character data to set up the form
        urlInput.value = "https://www.dndbeyond.com/characters/" + characterData.Id;

        if (btnGroup) {
            newButton.addEventListener('click', function (event) {
                event.preventDefault();
                addName(nameInput, characterData);
                addHP(hitPoints, characterData);
                addAC(armourClass, characterData);
                addInitiative(initiative, characterData);
            });
        } 
    }

    function createCharacterSelector(characters, activeCharacterId, defaultCharacterData) {
        // Create a dropdown for character selection
        const selectorContainer = document.createElement('div');
        selectorContainer.classList.add('character-selector-container');
        selectorContainer.style.marginBottom = '10px';
        selectorContainer.style.width = '400px';
        selectorContainer.style.display = 'flex';
        selectorContainer.style.alignItems = 'center';

        const label = document.createElement('label');
        label.textContent = 'Select character to auto-fill: ';
        label.style.marginRight = '10px';

        const select = document.createElement('select');
        select.id = 'character-selector';
        select.classList.add('form-control');
        select.style.flex = '1';

        // Add options for each character
        Object.keys(characters).forEach(id => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = characters[id].Name || `Character ${id}`;
            // Select the active character by default
            if (id === activeCharacterId) {
                option.selected = true;
            }
            select.appendChild(option);
        });

        selectorContainer.appendChild(label);
        selectorContainer.appendChild(select);

        // Insert the selector before the button group
        if (btnGroup) {
            btnGroup.parentNode.insertBefore(selectorContainer, btnGroup);
        }

        // Determine which character data to use initially
        let currentCharacterData;
        if (activeCharacterId && characters[activeCharacterId]) {
            currentCharacterData = characters[activeCharacterId];
        } else if (defaultCharacterData) {
            currentCharacterData = defaultCharacterData;
        } else {
            const firstCharacterId = Object.keys(characters)[0];
            currentCharacterData = characters[firstCharacterId];
        }

        // Set initial URL
        if (currentCharacterData && currentCharacterData.Id) {
            urlInput.value = "https://www.dndbeyond.com/characters/" + currentCharacterData.Id;
        }

        // Handle character selection change
        select.addEventListener('change', function () {
            const selectedId = this.value;
            if (selectedId && characters[selectedId]) {
                currentCharacterData = characters[selectedId];
                if (currentCharacterData.Id) {
                    urlInput.value = "https://www.dndbeyond.com/characters/" + currentCharacterData.Id;
                }
            }
        });

        // Setup the auto-fill button
        if (btnGroup && currentCharacterData) {
            newButton.addEventListener('click', function (event) {
                event.preventDefault();
                const selectedId = document.getElementById('character-selector').value;
                const selectedCharacter = characters[selectedId];

                addName(nameInput, selectedCharacter);
                addHP(hitPoints, selectedCharacter);
                addAC(armourClass, selectedCharacter);
                addInitiative(initiative, selectedCharacter);
            });
        }
    }
}, 0);

function createButton(text) {
    const button = document.createElement('button');
    button.textContent = text;
    button.classList.add('custom-button');
    return button;
}

function addName(nameInput, characterData) {
    if (nameInput && characterData && characterData.Name) {
        nameInput.value = characterData.Name;
    }
}

function addHP(hitPoints, characterData) {
    if (hitPoints && characterData && characterData.HitPoints) {
        hitPoints.value = characterData.HitPoints;
    }
}

function addAC(armourClass, characterData) {
    if (armourClass && characterData && characterData.ArmourClass) {
        armourClass.value = characterData.ArmourClass;
    }
}

function addInitiative(initiative, characterData) {
    if (initiative && characterData && characterData.Initiative) {
        initiative.value = characterData.Initiative;
    }
}

function checkArmour(name, stats, armourData, characterData) {
    const dexterityMod = Math.floor((stats.totalDexterity - 10) / 2);
    let number = 0;

    // Light Armor
    if (name === "Padded" || name === "Leather") {
        number = 11 + dexterityMod;
    } else if (name === "Studded Leather") {
        number = 12 + dexterityMod;
    }

    // Medium Armor
    else if (name === "Hide") {
        number = 12 + Math.min(dexterityMod, 2);
    } else if (name === "Chain Shirt") {
        number = 13 + Math.min(dexterityMod, 2);
    } else if (name === "Scale Mail" || name === "Breastplate") {
        number = 14 + Math.min(dexterityMod, 2);
    } else if (name === "Half Plate") {
        number = 15 + Math.min(dexterityMod, 2);
    }

    // Heavy Armor
    else if (name === "Ring Mail") {
        number = 14;
    } else if (name === "Chain Mail") {
        number = 16;
    } else if (name === "Splint") {
        number = 17;
    } else if (name === "Plate") {
        number = 18;
    }

    // Default Armor
    else {
        number = armourData.definition.armorClass;
    }

    for (let i = 0; i < characterData.feats.length; i++) {
        if (characterData.feats[i].definition.name === "Medium Armour Master") {
            number = number + 1
        }
    }

    return number;
}
