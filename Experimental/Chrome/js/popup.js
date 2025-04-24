document.addEventListener('DOMContentLoaded', function () {
    // Fetch character info when the button is clicked
    document.getElementById('fetchButton').addEventListener('click', function () {
        showSpinner();
        fetchCharacterInfo();
    });

    document.getElementById('editButton').addEventListener('click', function () {
        chrome.tabs.create({ url: chrome.runtime.getURL('html/edit.html') });
    });

    //export data
    document.getElementById('exportButton').addEventListener('click', function () {
        exportCharacterData();
    });

    //import data
    document.getElementById('importFile').addEventListener('change', function (event) {
        importCharacterData(event);
    });

    // Character selection dropdown
    const characterSelect = document.getElementById('characterSelect');
    characterSelect.addEventListener('change', function () {
        const selectedId = characterSelect.value;
        if (selectedId) {
            loadSelectedCharacter(selectedId);
        } else {
            clearCharacterInfo();
        }
    });

    // Delete character button
    document.getElementById('deleteCharacterButton').addEventListener('click', function () {
        deleteSelectedCharacter();
    });

    const characterInfoElement = document.getElementById('characterInfo');
    characterInfoElement.style.display = 'none';

    // Load characters and populate dropdown
    loadCharacters();

    // Retrieve the stored character ID and populate the input field
    chrome.storage.local.get(['characterId', 'characterData'], function (result) {
        if (result.characterData) {
            console.log("result.characterData got");
            displayCharacterInfo(result.characterData);
            document.getElementById('exportButton').disabled = false;
        } else if (result.characterId) {
            console.log("characterId got");
            fetchCharacterInfo();
        } else {
            console.log("never mind");
            document.getElementById('exportButton').disabled = true;
        }
    });

    // Add event listener for Enter key press
    document.getElementById('characterIdInput').addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            showSpinner();
            document.getElementById('fetchButton').click();
        }
    });
});

//populate the character dropdown
function loadCharacters() {
    chrome.storage.local.get(['characters', 'activeCharacterId'], function (result) {
        const characterSelect = document.getElementById('characterSelect');

        while (characterSelect.options.length > 1) {
            characterSelect.remove(1);
        }

        //If characters exist in storage
        if (result.characters) {
            Object.keys(result.characters).forEach(id => {
                const character = result.characters[id];
                const option = document.createElement('option');
                option.value = id;
                option.textContent = character.Name || `Character ${id}`;
                characterSelect.appendChild(option);
            });

            //Select active character if exists
            if (result.activeCharacterId && result.characters[result.activeCharacterId]) {
                characterSelect.value = result.activeCharacterId;
                loadSelectedCharacter(result.activeCharacterId);
            } else if (characterSelect.options.length > 1) {
                characterSelect.selectedIndex = 1;
                loadSelectedCharacter(characterSelect.value);
            } else {
                document.getElementById('exportButton').disabled = true;
            }
        } else {
            document.getElementById('exportButton').disabled = true;
        }
    });
}

function loadSelectedCharacter(characterId) {
    chrome.storage.local.get('characters', function (result) {
        if (result.characters && result.characters[characterId]) {
            const characterData = result.characters[characterId];
            displayCharacterInfo(characterData);
            document.getElementById('exportButton').disabled = false;

            chrome.storage.local.set({ 'activeCharacterId': characterId });

            chrome.storage.local.set({
                'characterId': characterId,
                'characterData': characterData
            });
        }
    });
}

function deleteSelectedCharacter() {
    const characterSelect = document.getElementById('characterSelect');
    const selectedId = characterSelect.value;

    if (!selectedId) {
        displayMessage("No character selected to delete", "error");
        return;
    }

    if (confirm(`Are you sure you want to delete "${characterSelect.options[characterSelect.selectedIndex].text}"?`)) {
        chrome.storage.local.get('characters', function (result) {
            if (result.characters) {
                const characters = result.characters;
                delete characters[selectedId];

                chrome.storage.local.set({ 'characters': characters }, function () {
                    chrome.storage.local.get('activeCharacterId', function (result) {
                        if (result.activeCharacterId === selectedId) {
                            chrome.storage.local.remove('activeCharacterId');
                            chrome.storage.local.remove('characterId');
                            chrome.storage.local.remove('characterData');
                        }

                        loadCharacters();
                        clearCharacterInfo();
                        displayMessage(`Character deleted successfully`, "success");
                    });
                });
            }
        });
    }
}

function clearCharacterInfo() {
    const characterInfoElement = document.getElementById('characterInfo');
    characterInfoElement.innerHTML = '';
    characterInfoElement.style.display = 'none';
    document.getElementById('exportButton').disabled = true;
    displayError("");
}


//export character data
function exportCharacterData() {
    const characterSelect = document.getElementById('characterSelect');
    const selectedId = characterSelect.value;

    if (!selectedId) {
        displayMessage("No character selected to export", "error");
        return;
    }

    chrome.storage.local.get('characters', function (result) {
        if (!result.characters || !result.characters[selectedId]) {
            displayMessage("No character data available to export", "error");
            return;
        }

        // Create file data
        const characterData = result.characters[selectedId];
        const fileName = `${characterData.Name || 'character'}_data.json`;
        const jsonData = JSON.stringify(characterData, null, 2); // Pretty print with 2 spaces
        const blob = new Blob([jsonData], { type: 'application/json' });

        // Create download link and trigger download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();

        // Clean up
        setTimeout(() => {
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        }, 0);

        displayMessage(`Character data exported successfully! File saved as ${fileName} in your downloads folder.`, "success");
    });
}

//import character Data
function importCharacterData(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    showSpinner();

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const characterData = JSON.parse(e.target.result);

            // Basic validation - check for a few expected properties
            if (!characterData || !characterData.Name || !characterData.AbilityScores) {
                displayMessage("Invalid character data format", "error");
                hideSpinner();
                return;
            }

            // Generate a unique ID if the import doesn't have one
            const characterId = characterData.Id || Date.now().toString();

            // Save to chrome storage - both old format and new format
            chrome.storage.local.get('characters', function (result) {
                const characters = result.characters || {};
                characters[characterId] = characterData;

                chrome.storage.local.set({
                    'characterData': characterData,
                    'characterId': characterId,
                    'characters': characters,
                    'activeCharacterId': characterId
                }, function () {
                    loadCharacters();
                    displayCharacterInfo(characterData);
                    displayMessage("Character successfully imported: " + characterData.Name, "success");
                    document.getElementById('exportButton').disabled = false;
                    hideSpinner();
                });
            });

        } catch (error) {
            displayMessage("Error importing character data: " + error.message, "error");
            hideSpinner();
        }
    };

    reader.onerror = function () {
        displayMessage("Error reading file", "error");
        hideSpinner();
    };

    reader.readAsText(file);

    // Reset the file input so the same file can be selected again
    event.target.value = '';
}

function fetchCharacterInfo() {
    // Get the character ID from the input field
    const characterIdInput = document.getElementById('characterIdInput');
    const characterId = parseInt(characterIdInput.value, 10);

    if (isNaN(characterId) || characterId <= 0) {
        displayError("Invalid Character ID")
        hideSpinner();
        return;
    }

    // Clear input field
    characterIdInput.value = '';

    fetch(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`)
        .then(response => {
            if (!response.ok) {
                if (response.status === 403) {
                    displayError("403: Character must be in public setting not campaign only or private.")
                }
                else {
                    displayError(`HTTP error! Status: ${response.status}`)
                }
                hideSpinner();
            } else {
                return response.json()
            }
        })
        .then(data => {
            if (!data) return;

            calculateCharacterData(data.data);

            chrome.storage.local.get(['characterData', 'characters'], function (result) {
                const characterData = result.characterData;

                if (characterData) {
                    // Store in multi-character format
                    const characters = result.characters || {};
                    characters[characterId] = characterData;

                    chrome.storage.local.set({
                        'characters': characters,
                        'activeCharacterId': characterId
                    }, function () {
                        loadCharacters();
                        displayCharacterInfo(characterData);
                        document.getElementById('exportButton').disabled = false;
                    });
                }
            });

            hideSpinner();
        });
}

function displayCharacterInfo(characterData) {
    const characterInfoElement = document.getElementById('characterInfo');

    if (characterData && characterData.Name) {
        console.log("characterData", characterData);
        console.log("characterData.Name", characterData.Name);
        characterInfoElement.innerHTML = `
            <h3>${characterData.Name}</h3>
            <p>Level ${characterData.Level} ${characterData.Classes?.[0]?.Definition?.Name || ""}</p>
            <p>Last modified: ${new Date(characterData.LastModified).toLocaleDateString()}</p>
        `;
        characterInfoElement.style.display = 'block';
    } else {
        characterInfoElement.innerHTML = '';
        characterInfoElement.style.display = 'none';
    }

    displayError("");
}

function calculateCharacterData(data) {
    let characterData = {};

    //function calculations
    const characterStats = getCharacterStats(data);

    characterData.AbilityScores = {
        Score: {
            Strength: characterStats.totalStrength,
            Dexterity: characterStats.totalDexterity,
            Constitution: characterStats.totalConstitution,
            Intelligence: characterStats.totalIntellegence,
            Wisdom: characterStats.totalWisdom,
            Charisma: characterStats.totalCharisma
        },
        Modifier: {
            Strength: Math.floor((characterStats.totalStrength - 10) / 2),
            Dexterity: Math.floor((characterStats.totalDexterity - 10) / 2),
            Constitution: Math.floor((characterStats.totalConstitution - 10) / 2),
            Intelligence: Math.floor((characterStats.totalIntellegence - 10) / 2),
            Wisdom: Math.floor((characterStats.totalWisdom - 10) / 2),
            Charisma: Math.floor((characterStats.totalCharisma - 10) / 2)
        }
    };

    characterData.Appearance = {
        Gender: data.gender,
        Faith: data.faith,
        Age: data.age,
        Hair: data.hair,
        Eyes: data.eyes,
        Skin: data.skin,
        Height: data.height,
        Weight: data.weight,
    };

    characterData.Background = {
        Name: data.background.definition.name,
        Description: removeHtmlTags(data.background.definition.description),
        Feature: {
            Name: data.background.definition.featureName,
            Description: removeHtmlTags(data.background.definition.featureDescription)
        },
        Traits: data.traits
    };

    characterData.Race = {
        UsingSubRace: data.race.isSubRace,
        Name: data.race.fullName,
        Description: removeHtmlTags(data.race.description),
        HomebrewRace: data.race.isHomebrew,
        SubraceName: data.race.subRaceShortName,
        Speed: data.race.weightSpeeds.normal.walk,
        FlySpeed: data.race.weightSpeeds.normal.fly,
        SwimSpeed: data.race.weightSpeeds.normal.swim,
        BurrowSpeed: data.race.weightSpeeds.normal.burrow,
        ClimbingSpeed: data.race.weightSpeeds.normal.climb,
        Encumbered: data.race.weightSpeeds.encumbered,
        HeavilyEncumbered: data.race.weightSpeeds.heavilyEncumbered,
        Size: data.race.sizeId = 4 ? "Medium" : 3 ? "Small" : 2 ? "Tiny" : 5 ? "Large" : 6 ? "Huge" : 7 ? "Gargantuan" : "Size Unknown",
    };

    characterData.Notes = {
        Allies: removeHtmlTags(data.notes.allies),
        PersonalPossessions: removeHtmlTags(data.notes.personalPossessions),
        OtherHoldings: removeHtmlTags(data.notes.otherHoldings),
        Organizations: removeHtmlTags(data.notes.organizations),
        Enemies: removeHtmlTags(data.notes.enemies),
        Backstory: removeHtmlTags(data.notes.backstory),
        OtherNotes: removeHtmlTags(data.notes.otherNotes)
    };

    characterData.DeathSaves = {
        Failed: data.deathSaves.failCount,
        Success: data.deathSaves.successCount,
        IsStabilized: data.deathSaves.isStabilized
    };

    characterData.Id = data.id;
    characterData.Name = data.name;
    characterData.XP = data.currentXp;
    characterData.Level = calculateLevel(data.currentXp);
    characterData.ProficiencyBonus = Math.ceil(characterData.Level / 4) + 1;
    characterData.HitPoints = hitPoints(data, characterStats);
    characterData.TempHitPoints = 0;
    characterData.ArmourClass = armourClass(data, characterStats);
    characterData.Skills = skills(data, characterData, characterStats);
    characterData.SavingThrows = savingThrows(data, characterData, characterStats);
    characterData.Initiative = Math.floor((characterStats.totalDexterity - 10) / 2);
    characterData.Proficiencys = getProficiencies(characterData, data);
    characterData.Currencies = data.currencies;
    characterData.MaxCarryWeight = data.race.sizeId < 3 ? (characterData.AbilityScores.Score.Strength * 15) / 2 : (data.race.sizeId > 4 ? (characterData.AbilityScores.Score.Strength * 15) * 2 : (characterData.AbilityScores.Score.Strength * 15));
    characterData.DragPushLift = characterData.AbilityScores.Score.Strength * 30 * (data.race.sizeId > 4 ? 2 : (data.race.sizeId < 3 ? 0.5 : 1));
    characterData.Inventory = gatherInventory(data, characterData);
    characterData.Classes = gatherClasses(data, characterData);
    characterData.Feats = gatherFeats(data);

    // Gather actions first without processing templates
    characterData.Actions = gatherActionsRaw(data);
    characterData.LastModified = data.dateModified;

    //avoid calling more than once
    const { spellSlots, spellInfo, spells } = gatherSpells(data, characterData);
    characterData.SpellSlots = spellSlots;
    characterData.SpellInfo = spellInfo;
    characterData.Spells = spells;

    //To check for different things that
    //add to the character's stats
    characterData = checkModifiers(data, characterData);
    characterData = gatherCustom(data, characterData);
    characterData.Creatures = gatherCreatures(data);
    characterData.Extras = gatherExtras(data);

    // Process template strings in action descriptions after all data is gathered
    processActionTemplates(characterData);

    // Sort the dictionary alphabetically
    const sortedDictionary = Object.fromEntries(
        Object.entries(characterData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    );

    //DO NOT remove this no matter what
    chrome.storage.local.set({ 'characterData': characterData }, function () {
    });
}

// Gather actions without processing templates
function gatherActionsRaw(data) {
    const areas = ["race", "class", "background", "feat", "item"];
    let actions = {};

    for (let k = 0; k < areas.length; k++) {
        const area = areas[k];
        if (!data.actions[area] || !Array.isArray(data.actions[area])) {
            continue;
        }

        for (let i = 0; i < data.actions[area].length; i++) {
            const actionData = data.actions[area][i];
            const descriptionText = actionData.snippet || actionData.description || "";

            actions[Object.keys(actions).length] = {
                LimitedUse: {
                    MaxUse: actionData.limitedUse ? actionData.limitedUse.maxUses : 0,
                    CurrentUse: actionData.limitedUse ? actionData.limitedUse.currentUses : 0
                },
                Name: actionData.name,
                Description: descriptionText ? removeHtmlTags(descriptionText) : "",
                OnMissDescription: actionData.onMissDescription ? removeHtmlTags(actionData.onMissDescription) : "",
                SaveFailDescription: actionData.saveFailDescription ? removeHtmlTags(actionData.saveFailDescription) : "",
                SaveSuccessDescription: actionData.saveSuccessDescription ? removeHtmlTags(actionData.saveSuccessDescription) : "",
                FixedSaveDc: actionData.fixedSaveDc,
                AttackTypeRange: actionData.attackType,
                Dice: actionData.dice,
                Value: actionData.value,
                IsMartialArts: actionData.isMartialArts,
                isProficient: actionData.isProficient,
                SpellRangeType: actionData.spellRangeType,
                DisplayAsAttack: actionData.displayAsAttack
            };
        }
    }
    return actions;
}

// Process template strings in actions after character data is complete
function processActionTemplates(characterData) {
    for (const key in characterData.Actions) {
        if (characterData.Actions[key].Description) {
            characterData.Actions[key].Description = processTemplateString(characterData.Actions[key].Description, characterData);
        }
        if (characterData.Actions[key].OnMissDescription) {
            characterData.Actions[key].OnMissDescription = processTemplateString(characterData.Actions[key].OnMissDescription, characterData);
        }
        if (characterData.Actions[key].SaveFailDescription) {
            characterData.Actions[key].SaveFailDescription = processTemplateString(characterData.Actions[key].SaveFailDescription, characterData);
        }
        if (characterData.Actions[key].SaveSuccessDescription) {
            characterData.Actions[key].SaveSuccessDescription = processTemplateString(characterData.Actions[key].SaveSuccessDescription, characterData);
        }
    }
}

function displayError(message) {
    const errorMessageElement = document.getElementById('errorMessage');
    errorMessageElement.textContent = message;
}

/*=======================================
functions to calculate character Data
=========================================*/

function gatherCreatures(data) {
    let creatures = {};

    for (let i = 0; i < data.creatures.length; i++) {
        const creature = data.creatures[i].definition; // Corrected typo here
        creatures[i] = {
            ActionsDescription: removeHtmlTags(creature.actionsDescription),
            ArmourClass: creature.armorClass,
            ArmourClassDescription: removeHtmlTags(creature.armorClassDescription),
            AvatarUrl: creature.avatarUrl,
            AverageHitPoints: creature.averageHitPoints,
            ChallengeRating: creature.challengeRatingId,
            ConditionImmunities: creature.conditionImmunities,
            Gear: creature.gear,
            HasLair: creature.hasLair,
            HideCR: creature.hideCr,
            HitPoints: creature.hitPoints,
            Inititative: creature.initiative,
            IsHomebrew: creature.isHomebrew,
            IsLegendary: creature.isLegendary,
            LairChallengeRatingId: creature.lairChallengeRatingId,
            LairDescription: removeHtmlTags(creature.lairDescription),
            Languages: creature.languages,
            Movement: creature.movement,
            Name: creature.name,
            PassivePerception: creature.passivePerception,
            SavingThrows: creature.savingThrows,
            Senses: creature.senses,
            Skills: creature.skills,
            SpecialTraitsDescription: removeHtmlTags(creature.specialTraitsDescription),
            Stats: {
                Strength: creature.stats[0].value,
                Dexterity: creature.stats[1].value,
                Constitution: creature.stats[2].value,
                Intelligence: creature.stats[3].value,
                Wisdom: creature.stats[4].value,
                Charisma: creature.stats[5].value
            },
            Tags: creature.tags
        };
    }

    return creatures;
}

function gatherCustom(data, characterData) {
    const weaponKeywords = [
        "gun", "weapon", "sword", "bow", "blade", "dagger", "axe", "mace",
        "hammer", "spear", "staff", "crossbow", "flail", "halberd", "lance",
        "pike", "scimitar", "sling", "whip", "club", "rapier", "trident",
        "morningstar", "warhammer", "katana", "nunchaku", "shuriken", "throwing star"
    ];

    // Ensure characterData properties are initialized
    characterData.Inventory = characterData.Inventory || {};
    characterData.Actions = characterData.Actions || {};
    characterData.Spells = characterData.Spells || {};

    for (let i = 0; i < data.customActions.length; i++) {
        const customData = data.customActions[i];
        const description = customData.description ? customData.description.toLowerCase() : "";
        const snippet = customData.snippet ? customData.snippet.toLowerCase() : "";

        const isWeapon = weaponKeywords.some(keyword => description.includes(keyword));
        const isWeapon2 = weaponKeywords.some(keyword => snippet.includes(keyword));

        if (customData.displayAsAttack === true || customData.isSilvered === true || isWeapon || isWeapon2) {
            // weapon, add it to inventory and actions
            characterData.Inventory[Object.keys(characterData.Inventory).length + 1] = {
                ActionType: customData.actionType,
                activationType: customData.activationType,
                AoeSize: customData.aoeSize,
                AoeType: customData.aoeType,
                DamageBonus: customData.damageBonus,
                Description: customData.description,
                DiceCount: customData.diceCount,
                DiceType: customData.diceType,
                DisplayAsAttack: customData.displayAsAttack,
                IsMartialArts: customData.isMartialArts,
                IsOffHand: customData.isOffHand,
                IsProficient: customData.isProficient,
                IsSilvered: customData.isSilvered,
                longRange: customData.longRange,
                Name: customData.name,
                OnMissDescription: customData.onMissDescription,
                Range: customData.range,
                SaveFailDescription: customData.saveFailDescription,
                SaveSuccessDescription: customData.saveSuccessDescription,
                Snippet: customData.snippet,
                toHitBonus: customData.toHitBonus
            };

            characterData.Actions[Object.keys(characterData.Actions).length + 1] = {
                ActionType: customData.actionType,
                activationType: customData.activationType,
                AoeSize: customData.aoeSize,
                AoeType: customData.aoeType,
                DamageBonus: customData.damageBonus,
                Description: customData.description,
                DiceCount: customData.diceCount,
                DiceType: customData.diceType,
                DisplayAsAttack: customData.displayAsAttack,
                IsMartialArts: customData.isMartialArts,
                IsOffHand: customData.isOffHand,
                IsProficient: customData.isProficient,
                IsSilvered: customData.isSilvered,
                longRange: customData.longRange,
                Name: customData.name,
                OnMissDescription: customData.onMissDescription,
                Range: customData.range,
                SaveFailDescription: customData.saveFailDescription,
                SaveSuccessDescription: customData.saveSuccessDescription,
                Snippet: customData.snippet,
                toHitBonus: customData.toHitBonus
            };
        } else if (customData.range != null || description.includes("spell")) {
            characterData.Spells[Object.keys(characterData.Spells).length + 1] = {
                ActionType: customData.actionType,
                activationType: customData.activationType,
                AoeSize: customData.aoeSize,
                AoeType: customData.aoeType,
                DamageBonus: customData.damageBonus,
                Description: customData.description,
                DiceCount: customData.diceCount,
                DiceType: customData.diceType,
                DisplayAsAttack: customData.displayAsAttack,
                IsMartialArts: customData.isMartialArts,
                IsOffHand: customData.isOffHand,
                IsProficient: customData.isProficient,
                IsSilvered: customData.isSilvered,
                longRange: customData.longRange,
                Name: customData.name,
                OnMissDescription: customData.onMissDescription,
                Range: customData.range,
                SaveFailDescription: customData.saveFailDescription,
                SaveSuccessDescription: customData.saveSuccessDescription,
                Snippet: customData.snippet,
                toHitBonus: customData.toHitBonus
            };
        } else {
            characterData.Inventory[Object.keys(characterData.Inventory).length + 1] = {
                ActionType: customData.actionType,
                activationType: customData.activationType,
                AoeSize: customData.aoeSize,
                AoeType: customData.aoeType,
                DamageBonus: customData.damageBonus,
                Description: customData.description,
                DiceCount: customData.diceCount,
                DiceType: customData.diceType,
                DisplayAsAttack: customData.displayAsAttack,
                IsMartialArts: customData.isMartialArts,
                IsOffHand: customData.isOffHand,
                IsProficient: customData.isProficient,
                IsSilvered: customData.isSilvered,
                longRange: customData.longRange,
                Name: customData.name,
                OnMissDescription: customData.onMissDescription,
                Range: customData.range,
                SaveFailDescription: customData.saveFailDescription,
                SaveSuccessDescription: customData.saveSuccessDescription,
                Snippet: customData.snippet,
                toHitBonus: customData.toHitBonus
            };
        }
    }

    return characterData;
}

function checkModifiers(data, characterData) {
    const areas = ["race", "class", "background", "feat", "item"];

    for (let k = 0; k < areas.length; k++) {
        const area = areas[k];
        if (!data.modifiers[area] || !Array.isArray(data.modifiers[area])) {
            continue;
        }
        for (let j = 0; j < data.modifiers[area].length; j++) {
            const modifier = data.modifiers[area][j];
            if (modifier.subType.includes("bonus-range") && modifier.type.includes("eldritch-blast")) {
                Object.values(characterData.Spells).forEach(spell => {
                    if (spell.Definition.Name === "Eldritch Blast") {
                        spell.Definition.Range = modifier.value;
                        spell.Definition.FormatSpell.Range = `Range: ${modifier.fixedValue} feet`;
                    }
                });
            }
        }
    }

    return characterData;
}

// Add this function to parse the template strings in action descriptions
function processTemplateString(templateString, characterData) {
    // Check if the string contains a template pattern
    if (!templateString || !templateString.includes('{{')) return templateString;

    return templateString.replace(/{{(.*?)}}/g, (match, expression) => {
        // Handle the specific pattern we know: (modifier:cha+classlevel)@min:1#unsigned
        if (expression.includes('modifier:cha+classlevel')) {
            // Get charisma modifier from character data
            const charismaMod = characterData.AbilityScores.Modifier.Charisma;
            // Get character level
            const classLevel = characterData.Level;
            // Calculate the value (cha modifier + class level)
            let value = charismaMod + classLevel;

            // Check for @min:1 - don't let the value go below 1
            if (expression.includes('@min:1')) {
                value = Math.max(1, value);
            }

            // Check for #unsigned - ensure value is not displayed with a sign
            if (expression.includes('#unsigned')) {
                return Math.abs(value).toString();
            }

            return value.toString();
        }

        // Return the original match if we don't know how to process it
        return match;
    });
}

// Update the gatherActions function to process descriptions
function gatherActions(data) {
    const areas = ["race", "class", "background", "feat", "item"];
    let actions = {};

    for (let k = 0; k < areas.length; k++) {
        const area = areas[k];
        //skips this iteration if the current iteration of spellArea has no length
        if (!data.actions[area] || !Array.isArray(data.actions[area])) {
            continue;
        }

        for (let i = 0; i < data.actions[area].length; i++) {
            const actionData = data.actions[area][i];
            const descriptionText = actionData.snippet || actionData.description || "";

            actions[Object.keys(actions).length] = {
                LimitedUse: {
                    MaxUse: actionData.limitedUse ? actionData.limitedUse.maxUses : 0,
                    CurrentUse: actionData.limitedUse ? actionData.limitedUse.currentUses : 0
                },
                Name: actionData.name,
                Description: descriptionText ? processTemplateString(removeHtmlTags(descriptionText), data) : "",
                OnMissDescription: actionData.onMissDescription ? removeHtmlTags(actionData.onMissDescription) : "",
                SaveFailDescription: actionData.saveFailDescription ? removeHtmlTags(actionData.saveFailDescription) : "",
                SaveSuccessDescription: actionData.saveSuccessDescription ? removeHtmlTags(actionData.saveSuccessDescription) : "",
                FixedSaveDc: actionData.fixedSaveDc,
                AttackTypeRange: actionData.attackType,
                Dice: actionData.dice,
                Value: actionData.value,
                IsMartialArts: actionData.isMartialArts,
                isProficient: actionData.isProficient,
                SpellRangeType: actionData.spellRangeType,
                DisplayAsAttack: actionData.displayAsAttack
            };
        }
    }
    return actions;
}

function gatherSpells(data, characterData) {
    let spellSlots = {};
    let spellInfo = {};
    let spells = {};

    //====
    // SPELL SLOTS
    //====
    // Standard wizard/full caster spell slots by character level
    const standardSpellSlots = {
        1: [2, 0, 0, 0, 0, 0, 0, 0, 0],
        2: [3, 0, 0, 0, 0, 0, 0, 0, 0],
        3: [4, 2, 0, 0, 0, 0, 0, 0, 0],
        4: [4, 3, 0, 0, 0, 0, 0, 0, 0],
        5: [4, 3, 2, 0, 0, 0, 0, 0, 0],
        6: [4, 3, 3, 0, 0, 0, 0, 0, 0],
        7: [4, 3, 3, 1, 0, 0, 0, 0, 0],
        8: [4, 3, 3, 2, 0, 0, 0, 0, 0],
        9: [4, 3, 3, 3, 1, 0, 0, 0, 0],
        10: [4, 3, 3, 3, 2, 0, 0, 0, 0],
        11: [4, 3, 3, 3, 2, 1, 0, 0, 0],
        12: [4, 3, 3, 3, 2, 1, 0, 0, 0],
        13: [4, 3, 3, 3, 2, 1, 1, 0, 0],
        14: [4, 3, 3, 3, 2, 1, 1, 0, 0],
        15: [4, 3, 3, 3, 2, 1, 1, 1, 0],
        16: [4, 3, 3, 3, 2, 1, 1, 1, 0],
        17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
        18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
        19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
        20: [4, 3, 3, 3, 3, 2, 2, 1, 1]
    };

    // Determine the character level and class
    const classLevel = data.classes[0].level;
    const className = data.classes[0].definition.name.toLowerCase();

    // Get the appropriate spell slots based on class and level
    let availableSpellSlots;

    // For a level 9 Wizard, this should be [4, 3, 3, 3, 1, 0, 0, 0, 0]
    if (className === "wizard" || className === "bard" || className === "cleric" ||
        className === "druid" || className === "sorcerer") {
        // Full casters use the standard table
        availableSpellSlots = standardSpellSlots[classLevel];
    } else if (className === "paladin" || className === "ranger") {
        // Half casters have their own progression (level/2 rounded down)
        const halfCasterLevel = Math.floor(classLevel / 2);
        if (halfCasterLevel > 0) {
            availableSpellSlots = standardSpellSlots[halfCasterLevel];
        } else {
            availableSpellSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
    } else if (className === "artificer") {
        // Artificers round up instead of down
        const artificerLevel = Math.ceil(classLevel / 2);
        if (artificerLevel > 0) {
            availableSpellSlots = standardSpellSlots[artificerLevel];
        } else {
            availableSpellSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        }
    } else if (className === "warlock") {
        // Warlocks have their own unique progression
        const warlockSlots = {
            1: [1, 0, 0, 0, 0, 0, 0, 0, 0], // 1 1st-level slot
            2: [2, 0, 0, 0, 0, 0, 0, 0, 0], // 2 1st-level slots
            3: [0, 2, 0, 0, 0, 0, 0, 0, 0], // 2 2nd-level slots
            4: [0, 2, 0, 0, 0, 0, 0, 0, 0], // 2 2nd-level slots
            5: [0, 0, 2, 0, 0, 0, 0, 0, 0], // 2 3rd-level slots
            6: [0, 0, 2, 0, 0, 0, 0, 0, 0], // 2 3rd-level slots
            7: [0, 0, 0, 2, 0, 0, 0, 0, 0], // 2 4th-level slots
            8: [0, 0, 0, 2, 0, 0, 0, 0, 0], // 2 4th-level slots
            9: [0, 0, 0, 0, 2, 0, 0, 0, 0], // 2 5th-level slots
            10: [0, 0, 0, 0, 2, 0, 0, 0, 0], // 2 5th-level slots
            11: [0, 0, 0, 0, 3, 0, 0, 0, 0], // 3 5th-level slots
            12: [0, 0, 0, 0, 3, 0, 0, 0, 0], // 3 5th-level slots
            13: [0, 0, 0, 0, 3, 0, 0, 0, 0], // 3 5th-level slots
            14: [0, 0, 0, 0, 3, 0, 0, 0, 0], // 3 5th-level slots
            15: [0, 0, 0, 0, 3, 0, 0, 0, 0], // 3 5th-level slots
            16: [0, 0, 0, 0, 3, 0, 0, 0, 0], // 3 5th-level slots
            17: [0, 0, 0, 0, 4, 0, 0, 0, 0], // 4 5th-level slots
            18: [0, 0, 0, 0, 4, 0, 0, 0, 0], // 4 5th-level slots
            19: [0, 0, 0, 0, 4, 0, 0, 0, 0], // 4 5th-level slots
            20: [0, 0, 0, 0, 4, 0, 0, 0, 0]  // 4 5th-level slots
        };
        availableSpellSlots = warlockSlots[classLevel] || [0, 0, 0, 0, 0, 0, 0, 0, 0];
    } else {
        // Default for non-spellcasters or unknown classes
        availableSpellSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    // Use the standard table as a fallback if needed
    if (!availableSpellSlots) {
        availableSpellSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    }

    // Create spell slots for all 9 levels
    for (let i = 0; i < 9; i++) {
        // Get the number of used slots from the data if available
        let usedSlots = 0;
        if (data.spellSlots && data.spellSlots[i]) {
            usedSlots = data.spellSlots[i].used || 0;
        }

        spellSlots[i] = {
            SpellSlotLevel: i + 1,
            Used: usedSlots,
            Available: availableSpellSlots[i] || 0 // Use the calculated available slots
        };
    }

    //====
    // SPELL INFO
    //====
    // Determine spellcasting ability based on class
    let abilityModifier;
    try {
        switch (className) {
            case "sorcerer":
            case "paladin":
            case "bard":
            case "warlock":
                abilityModifier = characterData.AbilityScores.Modifier.Charisma;
                break;
            case "wizard":
            case "artificer":
                abilityModifier = characterData.AbilityScores.Modifier.Intelligence;
                break;
            case "cleric":
            case "druid":
            case "ranger":
                abilityModifier = characterData.AbilityScores.Modifier.Wisdom;
                break;
            default:
                abilityModifier = 0; // Safe default
        }
    } catch (error) {
        console.error("Error setting spellcasting ability:", error);
        abilityModifier = 0; // Fallback to 0
    }

    spellInfo.SpellSave = 8 + abilityModifier + characterData.ProficiencyBonus;
    spellInfo.SpellAttack = characterData.ProficiencyBonus + abilityModifier;

    //====
    // SPELLS
    //====
    // Initialize spell counter
    let spellCounter = 0;

    // Process spells from standard areas
    const spellAreas = ["race", "class", "background", "feat"];
    for (let k = 0; k < spellAreas.length; k++) {
        const area = spellAreas[k];
        //skips this iteration if the current iteration of spellArea has no length
        if (!data.spells[area] || !Array.isArray(data.spells[area])) {
            continue;
        }
        for (let i = 0; i < data.spells[area].length; i++) {
            const spell = data.spells[area][i];
            const definition = spell.definition;
            const activation = definition.activation;
            const duration = definition.duration;

            spells[spellCounter] = {
                OverrideDC: spell.overrideSaveDc,
                LimitedUse: spell.limitedUse,
                Prepared: spell.prepared,
                CountAsKnownSpell: spell.countsAsKnownSpell,
                UsesSpellSlot: spell.usesSpellSlot,
                alwaysPrepared: spell.alwaysPrepared,
                CastAsRitual: spell.castOnlyAsRitual,
                Definition: {
                    Name: definition.name,
                    Level: definition.level,
                    School: definition.school,
                    Duration: duration,
                    Range: definition.range.rangeValue,
                    AsPartOfWeaponAttack: definition.asPartOfWeaponAttack,
                    Description: removeHtmlTags(definition.description),
                    Concentration: definition.concentration,
                    Ritual: definition.ritual,
                    RangeArea: definition.rangeArea,
                    DamageEffect: definition.damageEffect,
                    ComponentsDescription: removeHtmlTags(definition.componentsDescription),
                    Healing: definition.healing,
                    HealingDice: definition.healingDice,
                    TempHpDice: definition.tempHpDice,
                    AttackType: definition.attackType,
                    canCastAtHigherLevel: definition.canCastAtHigherLevel,
                    IsHomebrew: definition.isHomebrew,
                    RequiresSavingThrow: definition.requiresSavingThrow,
                    RequiresAttackRoll: definition.requiresAttackRoll,
                    AtHigherLevel: definition.atHigherLevels,
                    Conditions: definition.conditions,
                    Tags: definition.tags,
                    CastingTimeDescription: definition.castingTimeDescription,
                    FormatSpell: {
                        Time: `Casting Time: ${activation.activationTime} ${getActivationType(activation.activationType)}`,
                        Range: `Range: ${definition.range.rangeValue} feet`,
                        Duration: getDurationText(duration),
                        Components: `Components: ${getComponentsText(definition.components, definition.componentsDescription)}`,
                        SchoolLevel: getSchoolLevelText(definition)
                    }
                }
            };
            spellCounter++;
        }
    }

    // Process spells from classSpells
    for (let l = 0; l < data.classSpells.length; l++) {
        for (let i = 0; i < data.classSpells[l].spells.length; i++) {
            const spell = data.classSpells[l].spells[i];
            const definition = spell.definition;
            const activation = definition.activation;
            const duration = definition.duration;

            spells[spellCounter] = {
                OverrideDC: spell.overrideSaveDc,
                LimitedUse: spell.limitedUse,
                Prepared: spell.prepared,
                CountAsKnownSpell: spell.countsAsKnownSpell,
                UsesSpellSlot: spell.usesSpellSlot,
                alwaysPrepared: spell.alwaysPrepared,
                CastAsRitual: spell.castOnlyAsRitual,
                Definition: {
                    Name: definition.name,
                    Level: definition.level,
                    School: definition.school,
                    Duration: duration,
                    Range: definition.range.rangeValue,
                    AsPartOfWeaponAttack: definition.asPartOfWeaponAttack,
                    Description: removeHtmlTags(definition.description),
                    Concentration: definition.concentration,
                    Ritual: definition.ritual,
                    RangeArea: definition.rangeArea,
                    DamageEffect: definition.damageEffect,
                    ComponentsDescription: removeHtmlTags(definition.componentsDescription),
                    Healing: definition.healing,
                    HealingDice: definition.healingDice,
                    TempHpDice: definition.tempHpDice,
                    AttackType: definition.attackType,
                    canCastAtHigherLevel: definition.canCastAtHigherLevel,
                    IsHomebrew: definition.isHomebrew,
                    RequiresSavingThrow: definition.requiresSavingThrow,
                    RequiresAttackRoll: definition.requiresAttackRoll,
                    AtHigherLevel: definition.atHigherLevels,
                    Conditions: definition.conditions,
                    Tags: definition.tags,
                    CastingTimeDescription: definition.castingTimeDescription,
                    FormatSpell: {
                        Time: `Casting Time: ${activation.activationTime} ${getActivationType(activation.activationType)}`,
                        Range: `Range: ${definition.range.rangeValue} feet`,
                        Duration: getDurationText(duration),
                        Components: `Components: ${getComponentsText(definition.components, definition.componentsDescription)}`,
                        SchoolLevel: getSchoolLevelText(definition)
                    }
                }
            };
            spellCounter++;
        }
    }

    // Process Warlock's Mystic Arcanum spells (if character is a Warlock)
    if (className === "warlock") {
        // Check for Mystic Arcanum in options
        if (data.options && data.options.class) {
            for (let i = 0; i < data.options.class.length; i++) {
                const option = data.options.class[i];

                // Check if this is a Mystic Arcanum option
                if (option.definition && option.definition.name &&
                    option.definition.name.includes("Mystic Arcanum")) {

                    // If there's a spell associated with this Mystic Arcanum
                    if (option.definition.spellListIds && option.definition.spellListIds.length > 0) {
                        const spell = option.entityTypeId && data.spells.warlock_mystic_arcanum ?
                            data.spells.warlock_mystic_arcanum.find(s => s.entityId === option.entityId) : null;

                        if (!spell && data.spells.class) {
                            // Try to find the spell in class spells
                            const classSpell = data.spells.class.find(s => s.entityId === option.entityId);
                            if (classSpell) {
                                const definition = classSpell.definition;
                                const activation = definition.activation;
                                const duration = definition.duration;

                                spells[spellCounter] = {
                                    OverrideDC: classSpell.overrideSaveDc,
                                    LimitedUse: {
                                        maxUses: 1,
                                        numberUsed: 0,
                                        resetType: "long"
                                    },
                                    Prepared: true,
                                    CountAsKnownSpell: true,
                                    UsesSpellSlot: false, // Mystic Arcanum doesn't use spell slots
                                    alwaysPrepared: true,
                                    CastAsRitual: false,
                                    IsMysticArcanum: true, // Mark as Mystic Arcanum
                                    Definition: {
                                        Name: definition.name,
                                        Level: definition.level,
                                        School: definition.school,
                                        Duration: duration,
                                        Range: definition.range.rangeValue,
                                        AsPartOfWeaponAttack: definition.asPartOfWeaponAttack,
                                        Description: removeHtmlTags(definition.description),
                                        Concentration: definition.concentration,
                                        Ritual: definition.ritual,
                                        RangeArea: definition.rangeArea,
                                        DamageEffect: definition.damageEffect,
                                        ComponentsDescription: removeHtmlTags(definition.componentsDescription),
                                        Healing: definition.healing,
                                        HealingDice: definition.healingDice,
                                        TempHpDice: definition.tempHpDice,
                                        AttackType: definition.attackType,
                                        canCastAtHigherLevel: false, // Can't cast Mystic Arcanum at higher levels
                                        IsHomebrew: definition.isHomebrew,
                                        RequiresSavingThrow: definition.requiresSavingThrow,
                                        RequiresAttackRoll: definition.requiresAttackRoll,
                                        AtHigherLevel: definition.atHigherLevels,
                                        Conditions: definition.conditions,
                                        Tags: definition.tags,
                                        CastingTimeDescription: definition.castingTimeDescription,
                                        FormatSpell: {
                                            Time: `Casting Time: ${activation.activationTime} ${getActivationType(activation.activationType)}`,
                                            Range: `Range: ${definition.range.rangeValue} feet`,
                                            Duration: getDurationText(duration),
                                            Components: `Components: ${getComponentsText(definition.components, definition.componentsDescription)}`,
                                            SchoolLevel: `${definition.school} Level ${definition.level} (Mystic Arcanum)`
                                        }
                                    }
                                };
                                spellCounter++;
                            }
                        }

                        // If we found the spell in warlock_mystic_arcanum
                        if (spell) {
                            const definition = spell.definition;
                            const activation = definition.activation;
                            const duration = definition.duration;

                            spells[spellCounter] = {
                                OverrideDC: spell.overrideSaveDc,
                                LimitedUse: {
                                    maxUses: 1,
                                    numberUsed: 0,
                                    resetType: "long"
                                },
                                Prepared: true,
                                CountAsKnownSpell: true,
                                UsesSpellSlot: false, // Mystic Arcanum doesn't use spell slots
                                alwaysPrepared: true,
                                CastAsRitual: false,
                                IsMysticArcanum: true, // Mark as Mystic Arcanum
                                Definition: {
                                    Name: definition.name,
                                    Level: definition.level,
                                    School: definition.school,
                                    Duration: duration,
                                    Range: definition.range.rangeValue,
                                    AsPartOfWeaponAttack: definition.asPartOfWeaponAttack,
                                    Description: removeHtmlTags(definition.description),
                                    Concentration: definition.concentration,
                                    Ritual: definition.ritual,
                                    RangeArea: definition.rangeArea,
                                    DamageEffect: definition.damageEffect,
                                    ComponentsDescription: removeHtmlTags(definition.componentsDescription),
                                    Healing: definition.healing,
                                    HealingDice: definition.healingDice,
                                    TempHpDice: definition.tempHpDice,
                                    AttackType: definition.attackType,
                                    canCastAtHigherLevel: false, // Can't cast Mystic Arcanum at higher levels
                                    IsHomebrew: definition.isHomebrew,
                                    RequiresSavingThrow: definition.requiresSavingThrow,
                                    RequiresAttackRoll: definition.requiresAttackRoll,
                                    AtHigherLevel: definition.atHigherLevels,
                                    Conditions: definition.conditions,
                                    Tags: definition.tags,
                                    CastingTimeDescription: definition.castingTimeDescription,
                                    FormatSpell: {
                                        Time: `Casting Time: ${activation.activationTime} ${getActivationType(activation.activationType)}`,
                                        Range: `Range: ${definition.range.rangeValue} feet`,
                                        Duration: getDurationText(duration),
                                        Components: `Components: ${getComponentsText(definition.components, definition.componentsDescription)}`,
                                        SchoolLevel: `${definition.school} Level ${definition.level} (Mystic Arcanum)`
                                    }
                                }
                            };
                            spellCounter++;
                        }
                    }
                }
            }
        }
    }

    console.log("Generated spell slots:", spellSlots);
    return { spellSlots, spellInfo, spells };
}

function getActivationType(type) {
    switch (type) {
        case 1: return 'Action';
        case 3: return 'Bonus Action';
        case 4: return 'Reaction';
        case 6: return 'Minute';
        case 7: return 'Hour';
        default: return 'Unknown';
    }
}

function getDurationText(duration) {
    if (duration.durationType === "Instantaneous") {
        return 'Duration: Instantaneous';
    } else if (duration.durationInterval !== 0) {
        const interval = duration.durationInterval;
        const unit = duration.durationUnit;
        const type = duration.durationType === "Concentration" ? 'Concentration, up to' : '';
        return `Duration: ${type} ${interval} ${unit}${interval > 1 ? 's' : ''}`;
    }
    return '';
}

function getComponentsText(components, componentsDescription) {
    const componentsText = components.map(component => {
        switch (component) {
            case 1: return 'V';
            case 2: return 'S';
            case 3: return `M (${removeHtmlTags(componentsDescription)})`;
            default: return '';
        }
    });
    return componentsText.join(', ');
}

function getSchoolLevelText(definition) {
    const level = definition.level;
    const school = definition.school;
    const ritual = definition.ritual ? ' (ritual)' : '';
    return level === 0 ? `${school} Cantrip` : `${school} Level ${level}${ritual}`;
}

function gatherFeats(data) {
    let Feat = {};
    for (let i = 0; i < data.feats.length; i++) {
        Feat[i] = {
            Name: data.feats[i].definition.name,
            Description: removeHtmlTags(data.feats[i].definition.description),
            Snippet: removeHtmlTags(data.feats[i].definition.snippet),
            ActivationTime: data.feats[i].definition.activation.activationTime,
            ActivationType: data.feats[i].definition.activation.activationType,

        }
    }

    return Feat;
}

function gatherClasses(data, characterData) {
    let classes = {};
    for (let i = 0; i < data.classes.length; i++) {
        console.log(i);
        classes[i] = {
            Level: data.classes[i].level,
            IsStartingClass: data.classes[i].isStartingClass,
            HitDiceUsed: data.classes[i].hitDiceUsed,
            Definition: {
                Name: data.classes[i].definition.name,
                Description: removeHtmlTags(data.classes[i].definition.description).replace('<br>', ''),
                AvatarUrl: data.classes[i].definition.avatarUrl,
                LargeAvatarUrl: data.classes[i].definition.largeAvatarUrl,
                PortraitAvatarUrl: data.classes[i].definition.portraitAvatarUrl,
                ClassDetails: data.classes[i].definition.moreDetailsUrl,
                SpellCastingAbility: data.classes[i].definition.spellCastingAbility === 4 ? "Intelligence" : data.classes[i].definition.spellCastingAbility === 5 ? "Wisdom" : data.classes[i].definition.spellCastingAbility === 6 ? "Charisma" : "Spellcasting Ability Unknown",
                ClassFeatures: {},
                HitDice: data.classes[i].definition.hitDice,
                WealthDice: data.classes[i].definition.wealthDice,
                CanCastSpells: data.classes[i].definition.canCastSpells,
                KnowsAllSpells: data.classes[i].definition.knowsAllSpells,
                IsHomebrew: data.classes[i].definition.isHomebrew,
                SpellRules: {
                    IsRitualSpellCaster: data.classes[i].definition.spellRules?.isRitualSpellCaster,
                    NumberCantripsKnown: data.classes[i]?.definition?.spellRules?.levelCantripsKnownMaxes?.[characterData.Level] ?? 0, // Default to 0 if undefined
                    NumberSpellsKnown: data.classes[i]?.definition?.spellRules?.levelSpellKnownMaxes?.[characterData.Level] ?? 0, // Default to 0 if undefined
                    NumberPreparedSpells: data.classes[i]?.definition?.spellRules?.levelPreparedSpellMaxes?.[characterData.Level] ?? 0 // Default to 0 if undefined
                }
            },
            SubClassDefinition: null // Initialize as null by default
        };

        // Add class features first
        for (let j = 0; j < data.classes[i].definition.classFeatures.length; j++) {
            classes[i].Definition.ClassFeatures[j] = {
                Name: data.classes[i].definition.classFeatures[j].name,
                Description: removeHtmlTags(data.classes[i].definition.classFeatures[j].description),
                RequiredLevel: data.classes[i].definition.classFeatures[j].requiredLevel,
            };
        }

        // Check if subclass data exists before trying to access it
        if (data.classes[i].subclassDefinition) {
            // If subclass exists, populate the SubClassDefinition
            classes[i].SubClassDefinition = {
                Name: data.classes[i].subclassDefinition.name,
                Description: removeHtmlTags(data.classes[i].subclassDefinition.description),
                AvatarUrl: data.classes[i].subclassDefinition.avatarUrl,
                LargeAvatarUrl: data.classes[i].subclassDefinition.largeAvatarUrl,
                PortraitAvatarUrl: data.classes[i].subclassDefinition.portraitAvatarUrl,
                SubClassDetails: data.classes[i].subclassDefinition.moreDetailsUrl,
                ClassFeatures: {}
            };

            // Add subclass features if available
            for (let j = 0; j < data.classes[i].subclassDefinition.classFeatures.length; j++) {
                classes[i].SubClassDefinition.ClassFeatures[j] = {
                    Name: data.classes[i].subclassDefinition.classFeatures[j].name,
                    Description: removeHtmlTags(data.classes[i].subclassDefinition.classFeatures[j].description),
                    RequiredLevel: data.classes[i].subclassDefinition.classFeatures[j].requiredLevel,
                };
            }
        }
    }

    return classes;
}

function gatherInventory(data, characterData) {
    let inventory = {};

    function processInventoryItems(items, characterData) {
        const Finesse = ["Dagger", "Dart", "Rapier", "Scimitar", "Shortsword", "Whip"];
        const simpleWeapons = ["Club", "Dagger", "Greatclub", "Handaxe", "Javelin", "Light Hammer", "Mace", "Quarterstaff", "Staff", "Sickle", "Spear", "Crossbow, light", "Dart", "Shortbow", "Sling"];
        const martialWeapons = ["Battleaxe", "Flail", "Glaive", "Greataxe", "Greatsword", "Halberd", "Lance", "Longsword", "Maul", "Morningstar", "Pike", "Rapier", "Scimitar", "Shortsword", "Trident", "War Pick", "Warhammer", "Whip"];
        const rangedWeapons = ["Shortbow", "Longbow", "Crossbow, light", "Crossbow, hand", "Crossbow, heavy", "Sling", "Dart", "Javelin"];

        for (let i = 0; i < items.length; i++) {
            if (!items[i] || !items[i].definition) {
                continue;
            }

            inventory[i] = {
                Equipped: items[i].equipped,
                IsAttuned: items[i].isAttuned,
                Quantity: items[i].quantity,
                ChargesUsed: items[i].chargesUsed,
                LimitedUse: items[i].limitedUse,
                Definition: {
                    CanEquip: items[i].definition.canEquip,
                    Magic: items[i].definition.magic,
                    Name: items[i].definition.name,
                    Weight: items[i].definition.weight,
                    WeightMultiplier: items[i].definition.weightMultiplier,
                    Capacity: items[i].definition.capacity,
                    CapacityWeight: items[i].definition.capacityWeight,
                    Type: items[i].definition.type,
                    Description: removeHtmlTags(items[i].definition.description),
                    CanAttune: items[i].definition.canAttune,
                    attunementDescription: removeHtmlTags(items[i].definition.attunementDescription),
                    Rarity: items[i].definition.rarity,
                    IsHomebrew: items[i].definition.isHomebrew,
                    Stackable: items[i].definition.stackable,
                    Image: {
                        AvatarUrl: items[i].definition.avatarUrl,
                        Full: items[i].definition.largeAvatarUrl,
                    },
                    FilterType: items[i].definition.filterType,
                    Cost: items[i].definition.cost,
                    Tags: items[i].definition.tags,
                    GrantedModifiers: {},
                    IsConsumable: items[i].definition.isConsumable,
                    WeaponBehavior: items[i].definition.weaponBehaviors,
                    BaseArmourClass: items[i].definition.baseArmorName,
                    StrengthRequirement: items[i].definition.strengthRequirement,
                    ArmorClass: items[i].definition.armorClass,
                    StealthCheck: items[i].definition.stealthCheck,
                    Damage: items[i].definition.damage,
                    DamageType: items[i].definition.damageType,
                    FixedDamage: items[i].definition.fixedDamage,
                    Properties: items[i].definition.properties,
                    AttackType: items[i].definition.attackType,
                    Range: items[i].definition.range,
                    LongRange: items[i].definition.longRange,
                    IsMonkWeapon: items[i].definition.isMonkWeapon,
                    IsContainer: items[i].definition.isContainer,
                    IsCustomItem: items[i].definition.isCustomItem,
                    AttackRoll: "",
                    DamageRoll: ""
                }
            };

            for (let j = 0; j < items[i].definition.grantedModifiers.length; j++) {
                inventory[i].Definition.GrantedModifiers[j] = {
                    Type: items[i].definition.grantedModifiers[j].type,
                    subType: items[i].definition.grantedModifiers[j].subType,
                    Dice: items[i].definition.grantedModifiers[j].dice,
                    Restriction: removeHtmlTags(items[i].definition.grantedModifiers[j].restriction),
                    RequiresAttunement: items[i].definition.grantedModifiers[j].requiresAttunement,
                    Duration: items[i].definition.grantedModifiers[j].duration,
                    Value: items[i].definition.grantedModifiers[j].value,
                    AttackRoll: "",
                    DamageRoll: ""
                };
            }

            // Check if item is a weapon and calculate attack and damage rolls
            if (items[i].definition.filterType === "Weapon" ||
                items[i].definition.filterType === "Rod" ||
                items[i].definition.filterType === "Staff") {

                let modifier = 0;
                const itemName = items[i].definition.name;
                const isFinesse = Finesse.includes(itemName);
                const isSimpleWeapon = simpleWeapons.includes(itemName);
                const isMartialWeapon = martialWeapons.includes(itemName);
                const isRangedWeapon = rangedWeapons.includes(itemName);
                const isMonk = data.classes[0].definition.name === "Monk";

                // Calculate attack modifier
                if (isFinesse) {
                    modifier = Math.max(characterData.AbilityScores.Modifier.Dexterity, characterData.AbilityScores.Modifier.Strength);
                } else if (isRangedWeapon) {
                    modifier = characterData.AbilityScores.Modifier.Dexterity;
                } else if (isMonk) {
                    modifier = characterData.AbilityScores.Modifier.Dexterity;
                } else {
                    modifier = characterData.AbilityScores.Modifier.Strength;
                }

                if (characterData.Proficiencys.Weapons.includes(itemName) ||
                    isSimpleWeapon || isMartialWeapon ||
                    simpleWeapons.includes(items[i].definition.filterType)) {
                    modifier += characterData.ProficiencyBonus;
                }

                inventory[i].Definition.AttackRoll = "1d20+" + modifier;

                //Calculate damage roll
                let damageRoll = "";

                // Check for weapon behaviors to get damage dice
                if (items[i].definition.weaponBehaviors && items[i].definition.weaponBehaviors.length > 0) {
                    for (let j = 0; j < items[i].definition.weaponBehaviors.length; j++) {
                        const behavior = items[i].definition.weaponBehaviors[j];
                        if (behavior.damage && behavior.damage.diceString) {
                            damageRoll = behavior.damage.diceString;
                            break;
                        }
                    }
                }

                // Fallback to damage property if weaponBehaviors doesn't have damage info
                if (!damageRoll && items[i].definition.damage && items[i].definition.damage.diceString) {
                    damageRoll = items[i].definition.damage.diceString;
                }

                // Add the modifier to the damage roll
                if (damageRoll) {
                    inventory[i].Definition.DamageRoll = damageRoll + "+" + modifier;
                } else {
                    // Fallback if no damage dice are found
                    inventory[i].Definition.DamageRoll = "1d4+" + modifier;
                }
            }
        }
    }

    //Process custom inventory items
    function processCustomItems(items) {
        const inventoryLength = Object.keys(inventory).length;
        for (let i = 0; i < items.length; i++) {
            inventory[inventoryLength + i] = {
                CustomInventoryItem: true,
                Cost: items[i].cost,
                Description: removeHtmlTags(items[i].description),
                Name: items[i].name,
                Quantity: items[i].quantity,
                Weight: items[i].weight,
                Note: items[i].notes
            }
        }
    }

    //Process standard inventory items
    processInventoryItems(data.inventory, characterData);

    //Process custom inventory items
    if (data.customItems) {
        processCustomItems(data.customItems);
    }

    return inventory;
}

function background(data) {
    const characterBackground = {}
    if (data.background.hasCustomBackground === true) {

    } else {
        characterBackground.Name = data.background.definition.name;
        characterBackground.Description = removeHtmlTags(data.background.definition.description);
        characterBackground.Feature = {
            Name: data.background.definition.featureName,
            Description: removeHtmlTags(data.background.definition.featureDescription)
        }
    }

    return characterBackground;
}

function gatherExtras(data) {
    let extras = {};

    //gather any familiars or companion creatures from the Creatures section
    if (data.creatures && data.creatures.length > 0) {
        for (let i = 0; i < data.creatures.length; i++) {
            const creature = data.creatures[i];
            extras[Object.keys(extras).length] = {
                Name: creature.definition.name,
                Type: "Creature",
                Subtype: creature.definition.tags && creature.definition.tags.length > 0 ? creature.definition.tags.join(", ") : "",
                Description: removeHtmlTags(creature.definition.specialTraitsDescription || ""),
                Stats: {
                    Strength: creature.definition.stats[0].value,
                    Dexterity: creature.definition.stats[1].value,
                    Constitution: creature.definition.stats[2].value,
                    Intelligence: creature.definition.stats[3].value,
                    Wisdom: creature.definition.stats[4].value,
                    Charisma: creature.definition.stats[5].value
                },
                Actions: parseCreatureActions(creature.definition.actionsDescription),
                AvatarUrl: creature.definition.avatarUrl,
                HitPoints: creature.definition.averageHitPoints,
                ArmourClass: creature.definition.armorClass,
                PassivePerception: creature.definition.passivePerception,
                Senses: formatCreatureSenses(creature.definition.senses),
                IsCompanion: true
            };
        }
    }

    //additional pets, vehicles, or summoned creatures
    if (data.extras) {
        for (let i = 0; i < data.extras.length; i++) {
            const extra = data.extras[i];
            extras[Object.keys(extras).length] = {
                Name: extra.name || "Unnamed",
                Type: extra.type || "Extra",
                Subtype: extra.subType || "",
                Description: extra.description ? removeHtmlTags(extra.description) : "",
                Notes: extra.notes ? removeHtmlTags(extra.notes) : "",
                Stats: extra.stats ? {
                    Strength: extra.stats[0]?.value || 10,
                    Dexterity: extra.stats[1]?.value || 10,
                    Constitution: extra.stats[2]?.value || 10,
                    Intelligence: extra.stats[3]?.value || 10,
                    Wisdom: extra.stats[4]?.value || 10,
                    Charisma: extra.stats[5]?.value || 10
                } : null,
                AvatarUrl: extra.avatarUrl,
                HitPoints: extra.hitPoints,
                ArmourClass: extra.armorClass,
                Speed: extra.speed,
                IsCompanion: extra.isCompanion || false
            };
        }
    }

    const classFeatures = data.classes && data.classes[0]?.subclassDefinition?.classFeatures;
    if (classFeatures) {
        for (let i = 0; i < classFeatures.length; i++) {
            const feature = classFeatures[i];
            if (feature.name === "Dragon Companion" || feature.name === "Dragon Wings") {
                extras[Object.keys(extras).length] = {
                    Name: feature.name,
                    Type: "Class Feature",
                    Description: removeHtmlTags(feature.description),
                    IsCompanion: feature.name === "Dragon Companion",
                    IsTemporary: true,
                    RequiresActivation: true
                };
            }
        }
    }

    return extras;
}

function parseCreatureActions(actionsText) {
    if (!actionsText) return [];

    const actions = [];
    const actionLines = actionsText.split('.');

    let currentAction = null;

    for (const line of actionLines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        if (trimmedLine.includes("Attack:") || trimmedLine.includes("Melee Weapon Attack:")) {
            //attack action
            const actionName = trimmedLine.split(':')[0].trim();
            currentAction = {
                Name: actionName,
                Description: trimmedLine
            };
            actions.push(currentAction);
        } else if (trimmedLine.endsWith("action") || trimmedLine.includes("Multiattack")) {
            //an action
            currentAction = {
                Name: trimmedLine,
                Description: trimmedLine
            };
            actions.push(currentAction);
        } else if (currentAction) {
            //Continuation of the previous action
            currentAction.Description += ". " + trimmedLine;
        } else {
            //description that isn't an action
            actions.push({
                Name: "Special",
                Description: trimmedLine
            });
        }
    }

    return actions;
}

function formatCreatureSenses(senses) {
    if (!senses || senses.length === 0) return "";

    return senses.map(sense => {
        const senseTypes = {
            1: "Blindsight",
            2: "Darkvision",
            3: "Tremorsense",
            4: "Truesight"
        };

        const senseType = senseTypes[sense.senseId] || "Special Sense";
        return `${senseType} ${sense.notes}`;
    }).join(", ");
}

function getProficiencies(characterData, data) {
    Proficiencys = {
        Armour: [],
        Weapons: [],
        Tools: [],
        Languages: []
    }

    for (let i = 0; i < data.modifiers.race.length; i++) {
        const iteration = data.modifiers.race[i];
        if (iteration.type === "language") { Proficiencys.Languages.push(iteration.friendlySubtypeName); }
        if (iteration.type === "armor") { Proficiencys.Armour.push(iteration.friendlySubtypeName); }
        if (iteration.type === "weapon") { Proficiencys.Weapons.push(iteration.friendlySubtypeName); }
        if (iteration.type === "tool") { Proficiencys.Tools.push(iteration.friendlySubtypeName); }
    }

    for (let i = 0; i < data.modifiers.class.length; i++) {
        const iteration = data.modifiers.class[i];
        if (iteration.type === "proficiency") {
            if (iteration.subType.includes("armor")) { Proficiencys.Armour.push(iteration.friendlySubtypeName); }
            if (iteration.subType.includes("weapons")) { Proficiencys.Weapons.push(iteration.friendlySubtypeName); }
            if (iteration.subType.includes("tool")) { Proficiencys.Tools.push(iteration.friendlySubtypeName); }
            if (iteration.subType.includes("language")) { Proficiencys.Languages.push(iteration.friendlySubtypeName); }
        }
    }

    for (let i = 0; i < data.modifiers.background.length; i++) {
        const iteration = data.modifiers.background[i];
        if (iteration.type === "language") { Proficiencys.Languages.push(iteration.friendlySubtypeName); }
        if (iteration.type === "armor") { Proficiencys.Armour.push(iteration.friendlySubtypeName); }
        if (iteration.type === "weapon") { Proficiencys.Weapons.push(iteration.friendlySubtypeName); }
        if (iteration.type === "tool") { Proficiencys.Tools.push(iteration.friendlySubtypeName); }
    }

    return Proficiencys;
}

function savingThrows(characterData, data, stats) {
    const savingThrowList = ["Strength", "Dexterity", "Constitution", "Intellegence", "Wisdom", "Charisma"];
    const savingThrowsData = {};

    for (let i = 0; i < savingThrowList.length; i++) {
        const savingThrow = savingThrowList[i];

        // Initialize saving throw entry
        savingThrowsData[savingThrow] = {
            isChecked: false,
            total: 0
        };

        for (let j = 0; j < characterData.modifiers.class.length; j++) {
            if (characterData.modifiers.class[j].friendlySubtypeName === savingThrowList[i] + " Saving Throws") {
                savingThrowsData[savingThrow].isChecked = true;
            }
        }

        for (let j = 0; j < characterData.modifiers.class.length; j++) {
            if (characterData.modifiers.class[j].subType.includes(savingThrow.toLowerCase()) && characterData.modifiers.class[j].type === "proficiency") {
                savingThrowsData[savingThrow].isChecked = true;
            }
        }

        for (let j = 0; j < characterData.modifiers.race.length; j++) {
            if (characterData.modifiers.race[j].subType.includes(savingThrow.toLowerCase()) && characterData.modifiers.race[j].type === "proficiency") {
                savingThrowsData[savingThrow].isChecked = true;
            }
        }

        // Calculate total
        const characterProf = data.ProficiencyBonus;
        let total = 0;

        for (const feature in characterData.classes[0].classFeatures) {
            if (characterData.classes[0].classFeatures[feature].definition.name === "Aura of Protection") {
                total += 3;
            }
        }

        if (savingThrow === "Strength") {
            total += Math.floor((stats.totalStrength - 10) / 2) + characterProf;
        } else if (savingThrow === "Dexterity") {
            total += Math.floor((stats.totalDexterity - 10) / 2) + characterProf;
        } else if (savingThrow === "Constitution") {
            total += Math.floor((stats.totalConstitution - 10) / 2) + characterProf;
        } else if (savingThrow === "Intelligence") {
            total += Math.floor((stats.totalIntelligence - 10) / 2) + characterProf;
        } else if (savingThrow === "Wisdom") {
            total += Math.floor((stats.totalWisdom - 10) / 2) + characterProf;
        } else if (savingThrow === "Charisma") {
            total += Math.floor((stats.totalCharisma - 10) / 2) + characterProf;
        }

        savingThrowsData[savingThrow].total = total;
    }

    return savingThrowsData;
}

function skills(characterData, data, stats) {
    const listSkills = [
        { name: "Acrobatics", ability: "Dexterity" },
        { name: "Animal Handling", ability: "Wisdom" },
        { name: "Arcana", ability: "Intellegence" },
        { name: "Athletics", ability: "Strength" },
        { name: "Deception", ability: "Charisma" },
        { name: "History", ability: "Intellegence" },
        { name: "Insight", ability: "Wisdom" },
        { name: "Intimidation", ability: "Charisma" },
        { name: "Investigation", ability: "Intellegence" },
        { name: "Medicine", ability: "Wisdom" },
        { name: "Nature", ability: "Intellegence" },
        { name: "Perception", ability: "Wisdom" },
        { name: "Performance", ability: "Charisma" },
        { name: "Persuasion", ability: "Charisma" },
        { name: "Religion", ability: "Intellegence" },
        { name: "Sleight of Hand", ability: "Dexterity" },
        { name: "Stealth", ability: "Dexterity" },
        { name: "Survival", ability: "Wisdom" }
    ];
    const skillDictionary = {};

    for (let i = 0; i < listSkills.length; i++) {
        const skillName = listSkills[i].name;
        let isProficient = false;

        // Check proficiency from background, class, and race
        for (let j = 0; j < characterData.modifiers.background.length; j++) {
            if (characterData.modifiers.background[j].subType.includes(skillName.toLowerCase())) {
                isProficient = true;
                break;
            }
        }

        for (let j = 0; j < characterData.modifiers.class.length; j++) {
            if (characterData.modifiers.class[j].subType.includes(skillName.toLowerCase())) {
                isProficient = true;
                break;
            }
        }

        for (let j = 0; j < characterData.modifiers.race.length; j++) {
            if (characterData.modifiers.race[j].subType.includes(skillName.toLowerCase())) {
                isProficient = true;
                break;
            }
        }

        let totalModifier = 0;
        let characterProf = data.ProficiencyBonus;

        for (let j = 0; j < characterData.classes[0].classFeatures.length; j++) {
            if (characterData.classes[0].classFeatures[j].definition.name === "Expertise") {
                characterProf = characterProf * 2;
                break;
            }
        }

        // Calculate modifier based on the related ability score
        const ability = listSkills[i].ability;
        const baseModifier = Math.floor((stats[`total${ability}`] - 10) / 2);

        if (isProficient) {
            totalModifier = baseModifier + characterProf;
        } else {
            totalModifier = baseModifier;
        }

        // Save data into dictionary
        skillDictionary[skillName] = {
            isProficient: isProficient,
            ability: ability,
            totalModifier: totalModifier
        };
    }

    return skillDictionary;
}

function armourClass(characterData, stats) {
    let totalArmourClass = 0;
    const inventory = characterData.inventory;

    let hasEquippedArmor = false;
    let shieldAC = 0;

    // Loop through inventory to calculate AC from equipped armor and shields
    for (let item of inventory) {
        if (item.definition.armorClass != null) {
            if (item.equipped) {
                const armourAC = checkArmour(item.definition.name, stats, item, characterData);
                if (item.definition.name === "Shield") {
                    shieldAC = 2;  // Store shield AC separately
                } else {
                    totalArmourClass += armourAC;
                    hasEquippedArmor = true;
                }
            }
        }
    }

    // If no armor is equipped, calculate default AC
    if (!hasEquippedArmor) {
        const defaultAC = 10 + Math.floor((stats.totalDexterity - 10) / 2);
        totalArmourClass = defaultAC;
    }

    // Apply shield AC if applicable
    totalArmourClass += shieldAC;

    // Apply class-based AC bonuses
    const characterClass = characterData.classes[0].definition.name;
    const subclass = characterData.classes[0].subclassDefinition ? characterData.classes[0].subclassDefinition.name : "";

    if (characterClass === "Sorcerer" && subclass === "Draconic Bloodline") {
        const sorcererAC = 13 + Math.floor((stats.totalDexterity - 10) / 2);
        totalArmourClass = Math.max(totalArmourClass, sorcererAC);
    } else if (characterClass === "Monk") {
        const dexStat = Math.floor((characterData.stats[1].value - 10) / 2);
        const wisStat = Math.floor((characterData.stats[4].value - 10) / 2);
        const monkAC = 10 + dexStat + wisStat;
        totalArmourClass = Math.max(totalArmourClass, monkAC);
    } else if (characterClass === "Barbarian") {
        const dexStat = Math.floor((characterData.stats[1].value - 10) / 2);
        const conStat = Math.floor((characterData.stats[2].value - 10) / 2);
        const barbarianAC = 10 + dexStat + conStat;
        totalArmourClass = Math.max(totalArmourClass, barbarianAC);
    }

    // Apply race-based AC bonuses
    const raceBaseName = characterData.race.baseName;
    if (raceBaseName === "Lizardfolk") {
        const dexStat = Math.floor((characterData.stats[1].value - 10) / 2);
        const lizardfolkAC = 13 + dexStat;
        totalArmourClass = Math.max(totalArmourClass, lizardfolkAC);
    } else if (raceBaseName === "Locathah") {
        const dexStat = Math.floor((characterData.stats[1].value - 10) / 2);
        const locathahAC = 12 + dexStat;
        totalArmourClass = Math.max(totalArmourClass, locathahAC);
    } else if (raceBaseName === "Loxodon" || raceBaseName === "Tortle") {
        const dexStat = Math.floor((characterData.stats[1].value - 10) / 2);
        const loxodonTortleAC = 13 + dexStat;
        totalArmourClass = Math.max(totalArmourClass, loxodonTortleAC);
    }

    // Check for custom shield items
    for (let item of characterData.customItems) {
        try {
            if (item.name.toLowerCase().includes("shield") || item.notes.toLowerCase().includes("shield") || item.description.toLowerCase().includes("shield")) {
                totalArmourClass += 2;
            }
        } catch (TypeError) { }
    }

    // Check for the Armoured Bonus for a fighting style
    for (let option of characterData.options.class) {
        if (option.definition.name === "Defense") {
            totalArmourClass += 1;
        }
    }

    return totalArmourClass;
}

function checkArmour(armourName, stats, item, characterData) {
    let ac = 0;

    //armour class directly defined on the item
    if (item.definition.armorClass) {
        ac = item.definition.armorClass;
    }

    // If it's light armor, add DEX modifier (no cap)
    if (item.definition.type === "Light Armor") {
        ac += Math.floor((stats.totalDexterity - 10) / 2);
    }

    // If it's medium armor, add DEX modifier capped at +2
    else if (item.definition.type === "Medium Armor") {
        const dexMod = Math.floor((stats.totalDexterity - 10) / 2);
        ac += Math.min(dexMod, 2);
    }

    // Heavy armor has a fixed AC value, no DEX bonus
    else if (item.definition.type === "Heavy Armor") {
        // AC is already set from the item's armorClass
    }

    // For shield, we handle it separately in armourClass function
    else if (armourName === "Shield") {
        ac = 2;
    }

    else {
        if (item.definition.grantedModifiers) {
            for (let i = 0; i < item.definition.grantedModifiers.length; i++) {
                const modifier = item.definition.grantedModifiers[i];
                if (modifier.type === "bonus" && modifier.subType === "armor-class") {
                    ac += modifier.value;
                }
            }
        }
    }

    return ac;
}

function calculateLevel(xp) {
    const xpThresholds = [0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000];

    for (let i = 0; i < xpThresholds.length; i++) {
        if (xp < xpThresholds[i]) {
            return i;
        }
    }

    // If the XP is higher than all values in the table, return the last level
    return xpThresholds.length;
}

function hitPoints(data, characterStats) {
    if (data) {
        const conMod = Math.floor((characterStats.totalConstitution - 10) / 2); // Constitution modifier
        const level = data.classes[0].level;
        let hp = data.baseHitPoints + (conMod * level);

        // Adding hit points from modifiers
        for (let modifier of data.modifiers.class) {
            if (modifier.subType === "hit-points-per-level") {
                hp += parseInt(modifier.value) * level;
            }
        }

        // Additional hit points for specific class features
        if (data.classes[0].definition.name === "Sorcerer" && data.classes[0].subclassDefinition.name === "Draconic Bloodline") {
            hp += level; // Draconic Bloodline feature adds 1 HP per level
        }

        return hp + data.temporaryHitPoints;
    } else {
        console.log('Character Data not found in storage');
    }
}

function getCharacterStats(characterData) {
    let totalStrength = characterData.stats[0].value;
    let totalDexterity = characterData.stats[1].value;
    let totalConstitution = characterData.stats[2].value;
    let totalIntellegence = characterData.stats[3].value;
    let totalWisdom = characterData.stats[4].value;
    let totalCharisma = characterData.stats[5].value;

    for (let i = 0; i < characterData.modifiers.race.length; i++) {
        if (characterData.modifiers.race[i].friendlyTypeName === "Bonus") {
            const abilityIncrease = characterData.modifiers.race[i].friendlySubtypeName.replace(" Score", "");
            if (abilityIncrease === "Strength") {
                totalStrength += characterData.modifiers.race[i].value;
            } else if (abilityIncrease === "Dexterity") {
                totalDexterity += characterData.modifiers.race[i].value;
            } else if (abilityIncrease === "Constitution") {
                totalConstitution += characterData.modifiers.race[i].value;
            } else if (abilityIncrease === "Intellegence") {
                totalIntelligence += characterData.modifiers.race[i].value;
            } else if (abilityIncrease === "Wisdom") {
                totalWisdom += characterData.modifiers.race[i].value;
            } else if (abilityIncrease === "Charisma") {
                totalCharisma += characterData.modifiers.race[i].value;
            }
        }
    }

    for (let i = 0; i < characterData.modifiers.feat.length; i++) {
        const abilities = ["Strength", "Dexterity", "Constitution", "Intellegence", "Wisdom", "Charisma"]
        const type = characterData.modifiers.feat[i].friendlySubtypeName.replace(' Score', '');

        if (abilities.includes(type) && characterData.modifiers.feat[i].type === "bonus") {
            const ability = abilities.includes(type);
            if (type === "Strength" && ability === true) {
                totalStrength += characterData.modifiers.feat[i].value;
            } else if (type === 'Dexterity' && ability === true) {
                totalDexterity += characterData.modifiers.feat[i].value;
            } else if (type === 'Constitution' && ability === true) {
                totalConstitution += characterData.modifiers.feat[i].value;
            } else if (type === 'Intellegence' && ability === true) {
                totalIntellegence += characterData.modifiers.feat[i].value;
            } else if (type === 'Wisdom' && ability === true) {
                totalWisdom += characterData.modifiers.feat[i].value;
            } else if (type === 'Charisma' && ability === true) {
                totalCharisma += characterData.modifiers.feat[i].value;
            }
        }
    }

    for (let i = 0; i < characterData.modifiers.class.length; i++) {
        const abilities = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]
        const type = characterData.modifiers.class[i].friendlySubtypeName.replace(' Score', '');
        if (abilities.includes(type) && characterData.modifiers.class[i].type === "bonus") {
            const ability = abilities.includes(type);
            if (type === "Strength" && ability === true) {
                totalStrength += characterData.modifiers.class[i].value;
            } else if (type === 'Dexterity' && ability === true) {
                totalDexterity += characterData.modifiers.class[i].value;
            } else if (type === 'Constitution' && ability === true) {
                totalConstitution += characterData.modifiers.class[i].value;
            } else if (type === 'Intellegence' && ability === true) {
                totalIntellegence += characterData.modifiers.class[i].value;
            } else if (type === 'Wisdom' && ability === true) {
                totalWisdom += characterData.modifiers.class[i].value;
            } else if (type === 'Charisma' && ability === true) {
                totalCharisma += characterData.modifiers.class[i].value;
            }
        }
    }

    for (let i = 0; i < characterData.modifiers.background.length; i++) {
        const abilities = ["Strength", "Dexterity", "Constitution", "Intellegence", "Wisdom", "Charisma"]
        const type = characterData.modifiers.background[i].friendlySubtypeName.replace(' Score', '');

        if (abilities.includes(type) && characterData.modifiers.background[i].type === "bonus") {
            const ability = abilities.includes(type);
            if (type === "Strength" && ability === true) {
                totalStrength += characterData.modifiers.background[i].value;
            } else if (type === 'Dexterity' && ability === true) {
                totalDexterity += characterData.modifiers.background[i].value;
            } else if (type === 'Constitution' && ability === true) {
                totalConstitution += characterData.modifiers.background[i].value;
            } else if (type === 'Intellegence' && ability === true) {
                totalIntellegence += characterData.modifiers.background[i].value;
            } else if (type === 'Wisdom' && ability === true) {
                totalWisdom += characterData.modifiers.background[i].value;
            } else if (type === 'Charisma' && ability === true) {
                totalCharisma += characterData.modifiers.background[i].value;
            }
        }
    }

    for (let i = 0; i < characterData.modifiers.item.length; i++) {
        const abilities = ["Strength", "Dexterity", "Constitution", "Intellegence", "Wisdom", "Charisma"]
        const type = characterData.modifiers.item[i].friendlySubtypeName.replace(' Score', '');

        if (abilities.includes(type) && characterData.modifiers.item[i].type === "bonus") {
            const ability = abilities.includes(type);
            if (type === "Strength" && ability === true) {
                totalStrength += characterData.modifiers.item[i].value;
            } else if (type === 'Dexterity' && ability === true) {
                totalDexterity += characterData.modifiers.item[i].value;
            } else if (type === 'Constitution' && ability === true) {
                totalConstitution += characterData.modifiers.item[i].value;
            } else if (type === 'Intellegence' && ability === true) {
                totalIntellegence += characterData.modifiers.item[i].value;
            } else if (type === 'Wisdom' && ability === true) {
                totalWisdom += characterData.modifiers.item[i].value;
            } else if (type === 'Charisma' && ability === true) {
                totalCharisma += characterData.modifiers.item[i].value;
            }
        }
    }

    for (let i = 0; i < characterData.modifiers.condition.length; i++) {
        const abilities = ["Strength", "Dexterity", "Constitution", "Intellegence", "Wisdom", "Charisma"]
        const type = characterData.modifiers.condition[i].friendlySubtypeName.replace(' Score', '');

        if (abilities.includes(type) && characterData.modifiers.condition[i].type === "bonus") {
            const ability = abilities.includes(type);
            if (type === "Strength" && ability === true) {
                totalStrength += characterData.modifiers.condition[i].value;
            } else if (type === 'Dexterity' && ability === true) {
                totalDexterity += characterData.modifiers.condition[i].value;
            } else if (type === 'Constitution' && ability === true) {
                totalConstitution += characterData.modifiers.condition[i].value;
            } else if (type === 'Intellegence' && ability === true) {
                totalIntellegence += characterData.modifiers.condition[i].value;
            } else if (type === 'Wisdom' && ability === true) {
                totalWisdom += characterData.modifiers.condition[i].value;
            } else if (type === 'Charisma' && ability === true) {
                totalCharisma += characterData.modifiers.condition[i].value;
            }
        }
    }

    for (let i = 0; i < characterData.inventory.length; i++) {
        try {
            if (characterData.inventory[i].definition.grantedModifiers[0].subType === "constitution-score") {
                if (characterData.inventory[i].definition.grantedModifiers[0].type === "set") {
                    totalConstitution = characterData.inventory[i].definition.grantedModifiers[0].value;
                } else if (characterData.inventory[i].definition.grantedModifiers[0].type === "bonus") {
                    totalConstitution += characterData.inventory[i].definition.grantedModifiers[0].value;
                }
            } else if (characterData.inventory[i].definition.grantedModifiers[0].subType === "strength-score") {
                if (characterData.inventory[i].definition.grantedModifiers[0].type === "set") {
                    totalStrength = characterData.inventory[i].definition.grantedModifiers[0].value;
                } else if (characterData.inventory[i].definition.grantedModifiers[0].type === "bonus") {
                    totalStrength += characterData.inventory[i].definition.grantedModifiers[0].value;
                }
            } else if (characterData.inventory[i].definition.grantedModifiers[0].subType === "dexterity-score") {
                if (characterData.inventory[i].definition.grantedModifiers[0].type === "set") {
                    totalDexterity = characterData.inventory[i].definition.grantedModifiers[0].value;
                } else if (characterData.inventory[i].definition.grantedModifiers[0].type === "bonus") {
                    totalDexterity += characterData.inventory[i].definition.grantedModifiers[0].value;
                }
            } else if (characterData.inventory[i].definition.grantedModifiers[0].subType === "intellegence-score") {
                if (characterData.inventory[i].definition.grantedModifiers[0].type === "set") {
                    totalIntellegence = characterData.inventory[i].definition.grantedModifiers[0].value;
                } else if (characterData.inventory[i].definition.grantedModifiers[0].type === "bonus") {
                    totalIntellegence += characterData.inventory[i].definition.grantedModifiers[0].value;
                }
            } else if (characterData.inventory[i].definition.grantedModifiers[0].subType === "wisdom-score") {
                if (characterData.inventory[i].definition.grantedModifiers[0].type === "set") {
                    totalWisdom = characterData.inventory[i].definition.grantedModifiers[0].value;
                } else if (characterData.inventory[i].definition.grantedModifiers[0].type === "bonus") {
                    totalWisdom += characterData.inventory[i].definition.grantedModifiers[0].value;
                }
            } else if (characterData.inventory[i].definition.grantedModifiers[0].subType === "charisma-score") {
                if (characterData.inventory[i].definition.grantedModifiers[0].type === "set") {
                    totalCharisma = characterData.inventory[i].definition.grantedModifiers[0].value;
                } else if (characterData.inventory[i].definition.grantedModifiers[0].type === "bonus") {
                    totalCharisma += characterData.inventory[i].definition.grantedModifiers[0].value;
                }
            }
        } catch (TypeError) {
            continue
        }
    }

    if (characterData.overrideStats[0].value != null) {
        totalStrength = characterData.overrideStats[0].value;
    }

    if (characterData.overrideStats[1].value != null) {
        totalDexterity = characterData.overrideStats[1].value;
    }

    if (characterData.overrideStats[2].value != null) {
        totalConstitution = characterData.overrideStats[2].value;
    }

    if (characterData.overrideStats[3].value != null) {
        totalIntellegence = characterData.overrideStats[3].value;
    }

    if (characterData.overrideStats[4].value != null) {
        totalWisdom = characterData.overrideStats[4].value;
    }

    if (characterData.overrideStats[5].value != null) {
        totalCharisma = characterData.overrideStats[5].value;
    }

    return {
        totalStrength,
        totalDexterity,
        totalConstitution,
        totalIntellegence,
        totalWisdom,
        totalCharisma,
    };
}

function removeHtmlTags(htmlString) {
    if (!htmlString) {
        return "";
    }

    const inputString = String(htmlString);

    try {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = inputString;

        //Find all paragraphs and create well-formatted text with proper line breaks
        const paragraphs = tempDiv.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br, div');

        if (paragraphs.length > 0) {
            let formattedText = '';
            paragraphs.forEach(element => {
                //If it's a paragraph or heading, add a double line break after it
                if (element.tagName === 'P' ||
                    element.tagName.match(/H[1-6]/)) {
                    formattedText += element.textContent.trim() + '\n\n';
                }
                //If it's a list item, add a bullet point and a single line break
                else if (element.tagName === 'LI') {
                    formattedText += '� ' + element.textContent.trim() + '\n';
                }
                //If it's a BR, just add a line break
                else if (element.tagName === 'BR') {
                    formattedText += '\n';
                }
                //If it's a DIV, add a line break after its content
                else if (element.tagName === 'DIV') {
                    formattedText += element.textContent.trim() + '\n';
                }
            });

            formattedText = formattedText
                .replace(/\n{3,}/g, '\n\n')
                .trim();

            //Convert dice notation to clickable spans
            return convertDiceNotation(formattedText);
        } else {
            //If no paragraphs found, just get the text content
            let textContent = tempDiv.textContent || "";

            if (textContent.length > 80) {
                textContent = textContent.replace(/\.(\s+)/g, '.\n');
                textContent = textContent.replace(/\n{3,}/g, '\n\n');
            }

            return convertDiceNotation(textContent.trim());
        }
    } catch (e) {
        console.error('Error parsing HTML:', e);
        const fallbackText = inputString
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<[^>]*>/g, '')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/\s+/g, ' ')
            .trim();

        return convertDiceNotation(fallbackText);
    }
}

//converts a dice notation (e.g., 2d10+3) to a clickable link
function convertDiceNotation(text) {
    const diceRegex = /\b(\d+)d(\d+)(?:([+-])(\d+))?\b/g;
    return text.replace(diceRegex, function (match, count, sides, operator, modifier) {
        return `<span class="dice-roll" data-dice="${match}" style="color: #f08000; text-decoration: underline; cursor: pointer; font-weight: bold;">${match}</span>`;
    });
}

//This will handle and replace strings like "{{(modifier:cha+classlevel)@min:1#unsigned}"
function processTemplateString(templateString, characterData) {
    if (!templateString || !templateString.includes('{{')) return templateString;

    return templateString.replace(/{{(.*?)}}/g, (match, expression) => {
        if (expression.includes('modifier:cha+classlevel')) {
            const charismaMod = characterData.AbilityScores.Modifier.Charisma;
            const classLevel = characterData.Level;
            let value = charismaMod + classLevel;

            if (expression.includes('@min:1')) {
                value = Math.max(1, value);
            }

            if (expression.includes('#unsigned')) {
                return Math.abs(value).toString();
            }

            return value.toString();
        }

        return match;
    });
}

function showSpinner() {
    const spinnerContainer = document.getElementById('spinner-container');
    if (spinnerContainer) {
        spinnerContainer.style.display = 'flex';
    } else {
        console.error('Spinner container not found');
    }
}

function hideSpinner() {
    const spinnerContainer = document.getElementById('spinner-container');
    if (spinnerContainer) {
        spinnerContainer.style.display = 'none';
    } else {
        console.error('Spinner container not found');
    }
}

function displayMessage(message, type) {
    const errorMessageElement = document.getElementById('errorMessage');
    errorMessageElement.textContent = message;

    // Reset classes
    errorMessageElement.classList.remove('error', 'success');

    // Add appropriate class
    if (type) {
        errorMessageElement.classList.add(type);
    }
}

function displayError(message) {
    displayMessage(message, message ? "error" : "");
}