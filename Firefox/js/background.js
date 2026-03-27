var characterData = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'fetchCharacterInfo') {
        const characterId = message.characterId;
        const buttonIndex = message.buttonIndex;

        fetchCharacterInfo(characterId, buttonIndex, sendResponse);
        return true; 
    }

    if (message.type === 'ROLL_DICE') {
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (dice) => {
                try {
                    if (typeof window.roll_dice === 'function') {
                        window.roll_dice(dice);
                        return { success: true, message: 'Function directly called' };
                    } else {
                        return {
                            success: false,
                            error: 'roll_dice not a function',
                            type: typeof window.roll_dice,
                            exists: window.roll_dice !== undefined
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        error: error.toString(),
                        stack: error.stack
                    };
                }
            },
            args: [message.dice],
            world: 'MAIN'  
        }).then(results => {
            sendResponse(results[0]?.result);
        }).catch(error => {
            sendResponse({
                success: false,
                error: error.toString()
            });
        });
        return true;
    }

    if (message.type === 'ROLL_D20') {
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (modifier, rollType) => {
                try {
                    if (typeof window.roll_d20 === 'function') {
                        window.roll_d20(modifier, rollType);
                        return { success: true, message: 'roll_d20 called successfully' };
                    } else {
                        if (typeof window.roll_dice === 'function') {
                            const rollCommand = rollType === 1 ? "2d20kh1" + modifier :
                                rollType === 2 ? "2d20kl1" + modifier :
                                    "1d20" + modifier;
                            window.roll_dice(rollCommand);
                            return { success: true, message: 'Fallback to roll_dice' };
                        }
                        return {
                            success: false,
                            error: 'Neither roll_d20 nor roll_dice are available functions'
                        };
                    }
                } catch (error) {
                    return {
                        success: false,
                        error: error.toString(),
                        stack: error.stack
                    };
                }
            },
            args: [message.modifier, message.rollType],
            world: 'MAIN'
        }).then(results => {
            sendResponse(results[0]?.result);
        }).catch(error => {
            sendResponse({
                success: false,
                error: error.toString()
            });
        });
        return true;
    }

    if (message.type === 'SEND_DATA_TO_SIDEBAR') {
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (information, characterName) => {
                console.log('Attempting to call send_message with:', { information, characterName });

                try {
                    // Explicitly call the function
                    if (typeof window.send_message === 'function') {
                        window.send_message(information, characterName);
                        return { success: true, message: 'Function directly called' };
                    } else {
                        console.error('window.send_message is NOT a function');
                        return {
                            success: false,
                            error: 'send_message not a function',
                            type: typeof window.send_message,
                            exists: window.send_message !== undefined
                        };
                    }
                } catch (error) {
                    console.error('Error calling send_message:', error);
                    return {
                        success: false,
                        error: error.toString(),
                        stack: error.stack
                    };
                }
            },
            args: [message.information, message.characterName],
            world: 'MAIN'  // Ensures script runs in page context
        }).then(results => {
            sendResponse(results[0]?.result);
        }).catch(error => {
            sendResponse({
                success: false,
                error: error.toString()
            });
        });

        return true;  // For async response
    }
    if (message.type === 'APPLY_HEALING') {
        chrome.scripting.executeScript({
            target: { tabId: sender.tab.id },
            func: (healAmount) => {
                try {
                    // Use the my_character variable from Cauldron VTT's global scope
                    if (typeof window.object_damage_command === 'function' && window.my_character) {
                        window.object_damage_command(window.my_character, -parseInt(healAmount));
                        return { success: true, message: 'Healing applied successfully' };
                    } else {
                        console.error('Required functions or variables not available:',
                            'object_damage_command exists:', typeof window.object_damage_command === 'function',
                            'my_character exists:', !!window.my_character);
                        return {
                            success: false,
                            error: 'Required Cauldron VTT functions or variables not available',
                            object_damage_command_exists: typeof window.object_damage_command === 'function',
                            my_character_exists: !!window.my_character,
                            my_character_value: window.my_character
                        };
                    }
                } catch (error) {
                    console.error("Error applying healing:", error);
                    return {
                        success: false,
                        error: error.toString(),
                        stack: error.stack
                    };
                }
            },
            args: [message.healAmount],
            world: 'MAIN'  // Important: ensures script runs in the Cauldron VTT page context
        }).then(results => {
            sendResponse(results[0]?.result);
        }).catch(error => {
            sendResponse({
                success: false,
                error: error.toString()
            });
        });
        return true;
    }
});

function fetchCharacterInfo(characterId, buttonIndex, sendResponse) {
    fetch(`https://character-service.dndbeyond.com/character/v5/character/${characterId}`)
        .then(response => response.json())
        .then(data => {
            calculateCharacterData(data.data);

            // Correctly use chrome.storage.local.get with a callback
            chrome.storage.local.get(['characterData'], function (result) {
                console.log("Retrieved characterData from storage:", result.characterData);

                // Send the response back to the content script along with the button index
                sendResponse({
                    characterInfo: data.data,
                    buttonIndex: buttonIndex,
                    storedCharacterData: result.characterData // Including stored data if needed
                });
            });
        })
        .catch(error => {
            console.error('Error fetching character info:', error);
            sendResponse({ error: error.message }); // Send error message
        });
}










































function calculateCharacterData(data) {
    let characterData = {};

    //function calculations
    const characterStats = getCharacterStats(data);

    const movementSpeeds = calculateMovementSpeeds(data, characterData);

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

    //there could be a real background or a custom background
    characterData.Background = {};

    if (data.background) {
        if (data.background.hasCustomBackground) {
            // Handle custom background
            characterData.Background = {
                Name: data.background.customBackground?.name || "Custom Background",
                Description: removeHtmlTags(data.background.customBackground?.description || ""),
                Feature: {
                    Name: data.background.customBackground?.featureName || "Custom Feature",
                    Description: removeHtmlTags(data.background.customBackground?.featureDescription || "")
                },
                Traits: data.traits
            };
        } else {
            // Handle standard background
            characterData.Background = {
                Name: data.background.definition?.name || "Unknown Background",
                Description: removeHtmlTags(data.background.definition?.description || ""),
                Feature: {
                    Name: data.background.definition?.featureName || "",
                    Description: removeHtmlTags(data.background.definition?.featureDescription || "")
                },
                Traits: data.traits
            };
        }
    } else {
        // Fallback if no background data exists
        characterData.Background = {
            Name: "No Background",
            Description: "",
            Feature: {
                Name: "",
                Description: ""
            },
            Traits: data.traits || {}
        };
    }

    characterData.Race = {
        UsingSubRace: data.race.isSubRace,
        Name: data.race.fullName,
        Description: removeHtmlTags(data.race.description),
        HomebrewRace: data.race.isHomebrew,
        SubraceName: data.race.subRaceShortName,
        Speed: movementSpeeds.walk,
        FlySpeed: movementSpeeds.fly,
        SwimSpeed: movementSpeeds.swim,
        BurrowSpeed: movementSpeeds.burrow,
        ClimbingSpeed: movementSpeeds.climb,
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

    const usesMilestones = data.preferences && data.preferences.progressionType === 1;

    let totalCharacterLevel = 0;
    if (data.classes && Array.isArray(data.classes)) {
        data.classes.forEach(classData => {
            totalCharacterLevel += classData.level || 0;
        });
    }

    characterData.Id = data.id;
    characterData.Name = data.name;
    characterData.XP = data.currentXp;
    characterData.UseMilestones = usesMilestones;
    characterData.Level = usesMilestones ? totalCharacterLevel : calculateLevel(data.currentXp);
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
    characterData.Preferences = data.preferences;

    // Gather actions first without processing templates
    characterData.Actions = gatherActionsRaw(data);
    characterData.LastModified = data.dateModified;

    const { spellSlots, spellInfo, spells } = gatherSpells(data, characterData);
    characterData.SpellSlots = spellSlots;
    characterData.SpellInfo = spellInfo;
    characterData.Spells = spells;

    //To check for different things that add to the character's stats
    characterData = checkModifiers(data, characterData);
    characterData = gatherCustom(data, characterData);
    characterData.Creatures = gatherCreatures(data);
    characterData.Extras = gatherExtras(data);

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

function calculateMovementSpeeds(data) {
    // Initialize speeds from race data
    let speeds = {
        walk: data.race.weightSpeeds.normal.walk || 30,
        fly: data.race.weightSpeeds.normal.fly || 0,
        swim: data.race.weightSpeeds.normal.swim || 0,
        burrow: data.race.weightSpeeds.normal.burrow || 0,
        climb: data.race.weightSpeeds.normal.climb || 0
    };

    // Store the base walking speed before any class modifications
    const baseWalkSpeed = speeds.walk;

    // Apply class-specific speed bonuses FIRST
    if (data.classes && data.classes.length > 0) {
        const characterClass = data.classes[0].definition.name.toLowerCase();
        const classLevel = data.classes[0].level;

        if (characterClass === "monk" && classLevel >= 2) {
            // Check if wearing armor (which would negate Unarmored Movement)
            const wearingArmor = data.inventory.some(item =>
                item.equipped &&
                item.definition.filterType === "Armor" &&
                item.definition.type !== "Shield"
            );

            if (!wearingArmor) {
                // Apply Monk's Unarmored Movement bonus based on level
                if (classLevel >= 18) speeds.walk += 30;
                else if (classLevel >= 14) speeds.walk += 25;
                else if (classLevel >= 10) speeds.walk += 20;
                else if (classLevel >= 6) speeds.walk += 15;
                else if (classLevel >= 2) speeds.walk += 10;

                console.log(`Applied monk speed bonus: +${speeds.walk - baseWalkSpeed}ft (${baseWalkSpeed} → ${speeds.walk})`);
            }
        }

        // Barbarian Fast Movement (level 5+)
        if (characterClass === "barbarian" && classLevel >= 5) {
            const wearingHeavyArmor = data.inventory.some(item =>
                item.equipped &&
                item.definition.filterType === "Armor" &&
                item.definition.type === "Heavy Armor"
            );

            if (!wearingHeavyArmor) {
                speeds.walk += 10; // Fast Movement
                console.log(`Applied barbarian Fast Movement: +10ft (${speeds.walk - 10} → ${speeds.walk})`);
            }
        }
    }

    // Custom speeds should ONLY override if they're meant to be ABSOLUTE values
    // Otherwise, they should adjust the already calculated speed
    if (data.customSpeeds && Array.isArray(data.customSpeeds)) {
        console.log("Found customSpeeds:", data.customSpeeds);

        for (let customSpeed of data.customSpeeds) {
            // Check if this is an absolute override or a relative adjustment
            const isRelativeAdjustment = customSpeed.isAdjustment === true;

            switch (customSpeed.movementId) {
                case 1: // Walking
                    if (isRelativeAdjustment) {
                        // Add to the current walking speed
                        speeds.walk += customSpeed.distance;
                        console.log(`Adjusted walking speed by ${customSpeed.distance}ft: ${speeds.walk}`);
                    } else {
                        // Override completely (only if higher than calculated speed to prevent loss of bonuses)
                        if (customSpeed.distance > speeds.walk) {
                            console.log(`Custom walking speed ${customSpeed.distance}ft is higher than calculated ${speeds.walk}ft, using custom speed`);
                            speeds.walk = customSpeed.distance;
                        } else {
                            console.log(`Keeping higher calculated walking speed ${speeds.walk}ft instead of custom ${customSpeed.distance}ft`);
                        }
                    }
                    break;
                case 2: // Burrowing - these special movement types can be fully overridden
                    speeds.burrow = customSpeed.distance;
                    break;
                case 3: // Climbing
                    speeds.climb = customSpeed.distance;
                    break;
                case 4: // Flying
                    speeds.fly = customSpeed.distance;
                    break;
                case 5: // Swimming
                    speeds.swim = customSpeed.distance;
                    break;
            }
        }
    }

    // Wood Elf Fleet of Foot trait (only apply if not already overridden)
    if (data.race.baseRaceId === 3 && data.race.subRaceShortName === "Wood" && speeds.walk < 35) {
        speeds.walk = 35; // Fleet of Foot trait sets base speed to 35 ft
    }

    // Process other modifiers from various sources
    const areas = ["race", "class", "background", "feat", "item"];

    for (let area of areas) {
        if (!data.modifiers[area] || !Array.isArray(data.modifiers[area])) {
            continue;
        }

        for (let modifier of data.modifiers[area]) {
            if (modifier.type === "bonus" || modifier.type === "set") {
                if (modifier.subType === "speed-walk" || modifier.subType === "speed") {
                    if (modifier.type === "set") {
                        // Only set if the new value is higher than current
                        if (modifier.value > speeds.walk) {
                            speeds.walk = modifier.value;
                        }
                    } else {
                        speeds.walk += modifier.value;
                    }
                } else if (modifier.subType === "speed-fly") {
                    if (modifier.type === "set") {
                        speeds.fly = modifier.value;
                    } else {
                        speeds.fly += modifier.value;
                    }
                } else if (modifier.subType === "speed-swim") {
                    if (modifier.type === "set") {
                        speeds.swim = modifier.value;
                    } else {
                        speeds.swim += modifier.value;
                    }
                } else if (modifier.subType === "speed-burrow") {
                    if (modifier.type === "set") {
                        speeds.burrow = modifier.value;
                    } else {
                        speeds.burrow += modifier.value;
                    }
                } else if (modifier.subType === "speed-climb") {
                    if (modifier.type === "set") {
                        speeds.climb = modifier.value;
                    } else {
                        speeds.climb += modifier.value;
                    }
                }
            }
        }
    }

    // Mobile feat bonus
    const hasMobileFeat = data.feats && data.feats.some(feat => feat.definition.name === "Mobile");
    if (hasMobileFeat) {
        speeds.walk += 10;
        console.log("Applied Mobile feat bonus: +10ft");
    }

    console.log("Final calculated speeds:", speeds);
    return speeds;
}


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

    // Initialize Pact Magic for warlocks
    if (className === "warlock") {
        // Calculate warlock pact magic details
        const pactLevel = getPactMagicLevel(classLevel);
        const pactSlotsCount = getPactMagicSlots(classLevel);

        // Initialize the Pact property in characterData
        characterData.Pact = {
            SlotsUsed: 0,  // Start with 0 used slots
            SlotLevel: pactLevel, // The spell level of pact magic slots
            MaxSlots: pactSlotsCount // Total number of pact slots
        };

        console.log(`Initialized Pact Magic for level ${classLevel} Warlock: ${pactSlotsCount} slots of level ${pactLevel}`);
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

// Helper function to determine pact magic level based on warlock level
function getPactMagicLevel(warlockLevel) {
    if (warlockLevel >= 9) return 5;    // 9th level and up gets 5th level slots
    if (warlockLevel >= 7) return 4;    // 7th and 8th level get 4th level slots
    if (warlockLevel >= 5) return 3;    // 5th and 6th level get 3rd level slots
    if (warlockLevel >= 3) return 2;    // 3rd and 4th level get 2nd level slots
    return 1;                           // 1st and 2nd level get 1st level slots
}

// Helper function to determine number of pact magic slots based on warlock level
function getPactMagicSlots(warlockLevel) {
    if (warlockLevel >= 17) return 4;   // 17th level and up gets 4 slots
    if (warlockLevel >= 11) return 3;   // 11th-16th level gets 3 slots
    if (warlockLevel >= 2) return 2;    // 2nd-10th level gets 2 slots
    return 1;                           // 1st level gets 1 slot
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
    let proficiencies = {
        Armour: [],
        Weapons: [],
        Tools: [],
        Languages: []
    };

    // Helper to add items uniquely
    function addUnique(list, items) {
        if (!Array.isArray(items)) items = [items];
        items.forEach(item => {
            if (item && !list.includes(item)) {
                list.push(item);
            }
        });
    }

    // Get base proficiencies from class
    if (data.classes && data.classes[0] && data.classes[0].definition) {
        const classProfs = data.classes[0].definition.proficiencies || [];
        classProfs.forEach(prof => {
            if (prof.toLowerCase().includes('armor')) {
                addUnique(proficiencies.Armour, prof);
            }
            if (prof.toLowerCase().includes('weapons')) {
                addUnique(proficiencies.Weapons, prof);
            }
        });
    }

    // Get racial weapon proficiencies
    if (data.race && data.race.racialTraits) {
        data.race.racialTraits.forEach(trait => {
            if (trait.definition.name === "Dwarven Combat Training") {
                const weapons = ["Battleaxe", "Handaxe", "Light Hammer", "Warhammer"];
                addUnique(proficiencies.Weapons, weapons);
            }
            // Add tool proficiency from race
            if (trait.definition.name === "Tool Proficiency") {
                addUnique(proficiencies.Tools, "Mason's Tools");
            }
        });
    }

    // Get background proficiencies
    if (data.background && data.background.definition) {
        // Get tool proficiencies from background
        const toolProfs = data.background.definition.toolProficienciesDescription;
        if (toolProfs) {
            const tools = toolProfs.split(',')
                .map(t => t.trim())
                .filter(t => t && t !== "");
            addUnique(proficiencies.Tools, tools);
        }

        // Get languages from background
        if (data.background.definition.languages) {
            addUnique(proficiencies.Languages, data.background.definition.languages);
        }
    }

    // Get racial languages
    if (data.race && data.race.racialTraits) {
        data.race.racialTraits.forEach(trait => {
            if (trait.definition.name === "Languages") {
                const languages = trait.definition.options || [];
                languages.forEach(lang => addUnique(proficiencies.Languages, lang.label));
            }
        });
    }

    // Get subrace languages
    if (data.race.subRaceDefinition && data.race.subRaceDefinition.racialTraits) {
        data.race.subRaceDefinition.racialTraits.forEach(trait => {
            if (trait.definition.name === "Languages") {
                const languages = trait.definition.options || [];
                languages.forEach(lang => addUnique(proficiencies.Languages, lang.label));
            }
        });
    }

    // Check for custom languages
    if (data.customLanguages && Array.isArray(data.customLanguages)) {
        data.customLanguages.forEach(lang => {
            if (lang.name) {
                addUnique(proficiencies.Languages, lang.name);
            }
        });
    }

    // Check for languages in modifiers
    const areas = ["race", "class", "background", "feat", "item"];
    for (let area of areas) {
        if (data.modifiers[area]) {
            data.modifiers[area].forEach(mod => {
                if (mod.type === "language" || mod.subType === "language") {
                    if (mod.friendlySubtypeName) {
                        addUnique(proficiencies.Languages, mod.friendlySubtypeName);
                    }
                }
            });
        }
    }

    const standardLanguages = [
        "Common", "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin",
        "Halfling", "Orc", "Draconic", "Common Sign Language", "Abyssal",
        "Celestial", "Infernal", "Deep Speech", "Primordial", "Sylvan",
        "Undercommon", "Leonin", "Kraul", "Loxodon", "Merfolk", "Sphinx",
        "Vedalken", "Abanasinia", "Ergot", "Kharolian", "Kenderspeak",
        "Khur", "Nordmaarian", "Solamnic", "Riedran", "Quori", "Thri-kreen",
        "Gith", "Dambrathan", "Midani", "Alzhedo", "Chondathan", "Damaran",
        "Waelan", "Guran", "Halruaan", "Illuskan", "Roushoum", "Chessentan",
        "Mulhorandi", "Untheric", "Thayan", "Rashemi", "Shaaran", "Shou",
        "Tuigan", "Turmic", "Uluik", "Aeorian", "Galapa", "Marquesian",
        "Minotaur", "Naush", "Qoniiran", "Shadow Cant", "Ywan", "Zemnian",
        "Blink Dog", "Bullywug", "Giant Eagle", "Giant Elk", "Giant Owl",
        "Gnoll", "Grell", "Grung", "Hook Horror", "Kruthik", "Modron",
        "Otyugh", "Sahuagin", "Slaad", "Tlincalli", "Troglodyte", "Umber Hulk",
        "Vegepygmy", "Winter Wolf", "Worg", "Yeti"
    ];




    // Clean up and sort the lists
    proficiencies.Armour = [...new Set(proficiencies.Armour)].sort();
    proficiencies.Weapons = [...new Set(proficiencies.Weapons)].sort();
    proficiencies.Tools = [...new Set(proficiencies.Tools)].sort();
    proficiencies.Languages = [...new Set(proficiencies.Languages)].sort();

    // Set "None" for Armor if no armor proficiencies
    if (proficiencies.Armour.length === 0) {
        proficiencies.Armour = ["None"];
    }

    return proficiencies;
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
        // Process HTML with regex instead of DOM
        let result = inputString;

        // Replace common HTML elements with appropriate formatting
        result = result
            // Replace paragraph tags with content + double newlines
            .replace(/<p[^>]*>(.*?)<\/p>/gi, "$1\n\n")
            // Replace heading tags with content + double newlines
            .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi, "$1\n\n")
            // Replace list items with bullet points
            .replace(/<li[^>]*>(.*?)<\/li>/gi, "• $1\n")
            // Replace br tags with newlines
            .replace(/<br\s*\/?>/gi, "\n")
            // Replace div tags with content + newlines
            .replace(/<div[^>]*>(.*?)<\/div>/gi, "$1\n")
            // Strip remaining HTML tags
            .replace(/<[^>]*>/g, "")
            // Decode HTML entities
            .replace(/&nbsp;/g, " ")
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, "\"")
            .replace(/&#39;/g, "'")
            // Clean up excessive whitespace
            .replace(/\n{3,}/g, "\n\n")
            .replace(/  +/g, " ")
            .trim();

        return convertDiceNotation(result);
    } catch (e) {
        console.error('Error parsing HTML:', e);
        // Ultra simple fallback that just strips tags
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

//This will handle and replace strings like "{{(modifier:cha+classlevel)@min:1#unsigned}", "{{ classlevel }}", "{{ scalevalue }}"
function processTemplateString(templateString, characterData) {
    if (!templateString || !templateString.includes('{{')) return templateString;

    return templateString.replace(/{{(.*?)}}/g, (match, expression) => {
        const trimmedExpression = expression.trim();

        if (trimmedExpression === 'classlevel') { return characterData.Level.toString(); 
        if (trimmedExpression === 'scalevalue') { return characterData.Level.toString(); }

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