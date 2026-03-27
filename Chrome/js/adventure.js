//Chromium

//Constants
const SUBMENU_APPEAR_TRANSITION = 0.3;
const SUBMENU_REMAIN_TRANSITION = 400; //how long the Common Action sub menu stays visible before whilst cursor isn't hovered
const DICE_ROLL_NORMAL = 0;
const DICE_ROLL_ADVANTAGE = 1;
const DICE_ROLL_DISADVANTAGE = 2;

let characterData = null;

//Common Action
let CommonActionMenuOpen = false;
let commonActionClickListener = null; //check to ensure mulitple listeners aren't added to the common action menu

//Character sheet
let characterSheetOpen = false;
let searchInputFocused = false;

//DEBUG
chrome.storage.local.get('characterData', function (result) {
	characterData = result.characterData;
});

const currentURL = window.location.href;
const excludeRegex = /^https:\/\/www\.cauldron-vtt\.net\/adventure\/?$/;

if (!excludeRegex.test(currentURL)) {
	setTimeout(function () {
		const urlWithJsonOutput = window.location.href + "?output=json";
		fetchJsonDataFromUrl(urlWithJsonOutput)
			.then(adventureData => {
				adventureData = adventureData.adventure;

				// Get the player's character name from the adventure data
				let playerCharacterName = null;

				if (adventureData["@is_dm"] !== "yes") {
					// Not DM - find the player's character
					if (adventureData.characters && adventureData.characters["@mine"]) {
						// The @mine attribute indicates which character belongs to the current player
						const characterInstanceId = adventureData.characters["@mine"];

						// If there's a single character
						if (!Array.isArray(adventureData.characters.character)) {
							if (adventureData.characters.character.instance_id === characterInstanceId) {
								playerCharacterName = adventureData.characters.character.name;
							}
						}
						// If there are multiple characters
						else {
							for (const character of adventureData.characters.character) {
								if (character.instance_id === characterInstanceId) {
									playerCharacterName = character.name;
									break;
								}
							}
						}
					}

					// If character name wasn't found by instance_id but the @name attribute exists
					if (!playerCharacterName && adventureData.characters["@name"]) {
						playerCharacterName = adventureData.characters["@name"];
					}
				}

				// If we found the player's character name, load its data from storage
				if (playerCharacterName) {
					chrome.storage.local.get('characters', function (result) {
						if (result.characters) {
							// Find the matching character by name
							for (const [characterId, charData] of Object.entries(result.characters)) {
								if (charData.Name === playerCharacterName) {
									characterData = charData;

									// Set this as the active character for consistency
									chrome.storage.local.set({
										'activeCharacterId': characterId,
										'characterData': charData
									});

									break;
								}
							}
						}

						// If we couldn't find the character data, try the legacy method
						if (!characterData) {
							chrome.storage.local.get('characterData', function (result) {
								characterData = result.characterData;
							});
						} 

						// Set up the UI now that we have the character data
						setupAdventureUI(adventureData);
					});
				} else {
					// Fallback to legacy method if we couldn't determine the current player's character
					chrome.storage.local.get('characterData', function (result) {
						characterData = result.characterData;

						// Set up the UI with whatever character data we have
						setupAdventureUI(adventureData);
					});
				}
			})
			.catch(error => {
				console.error('Error fetching JSON data:', error);
			});
	}, 0);
}

function showDmView(buttonPressed, adventureData) {
	if (CommonActionMenuOpen != false) {
		return;
	}

	characterSheetOverlayOpen = true;

	try {
		const content = document.getElementById('overlayContainer');
		content.innerHTML = '';
	} catch { }

	const overlayContainer = document.createElement('div');
	overlayContainer.id = 'customOverlay';
	overlayContainer.classList.add('panel', 'panel-primary');
	overlayContainer.style.display = 'none';
	overlayContainer.style.position = 'fixed';
	overlayContainer.style.top = '40px';
	overlayContainer.style.left = '15px';
	overlayContainer.style.backgroundColor = 'rgba(255,255,255, 1)';
	overlayContainer.style.zIndex = '1010';
	overlayContainer.style.width = "375px";

	// Create overlay header
	const overlayHeader = document.createElement('div');
	overlayHeader.classList.add('panel-heading');
	overlayHeader.id = "titleBar";
	overlayHeader.innerHTML = `${adventureData.title} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	const closeButton = overlayHeader.querySelector('.close');
	closeButton.addEventListener('click', function () {
		overlayContainer.style.display = 'none';
		characterSheetOverlayOpen = false;

		const characterSheetOverlay = document.getElementById('customOverlay');
		if (characterSheetOverlay) {
			characterSheetOverlay.remove();
		}
	});

	// Create overlay body
	const overlayBody = document.createElement('div');
	overlayBody.classList.add('panel-body');

	// Create a div with the id "overlayContainer"
	const overlayContainerDiv = document.createElement('div');
	overlayContainerDiv.id = 'overlayContainer';

	// Create the table element inside the overlayContainerDiv
	const overlayTable = document.createElement('table');
	overlayTable.style.width = '100%';

	const headerRow = document.createElement('tr');
	const headerCell1 = document.createElement('th');
	headerCell1.textContent = 'PC';
	const headerCell2 = document.createElement('th');
	headerCell2.textContent = 'HP';
	const headerCell3 = document.createElement('th');
	headerCell3.textContent = 'AC';
	headerRow.style.borderBottom = '25px solid transparent';

	headerRow.appendChild(headerCell1);
	headerRow.appendChild(headerCell2);
	headerRow.appendChild(headerCell3);

	overlayTable.appendChild(headerRow);

	if (adventureData.characters.character.length == null) {
		const rowData = adventureData.characters.character;
		addRowToTable(rowData, overlayTable);
	} else {
		adventureData.characters.character.forEach(rowData => {
			addRowToTable(rowData, overlayTable);
		});
	}

	// Append the table to the overlayContainerDiv
	overlayContainerDiv.appendChild(overlayTable);

	// Append the overlayContainerDiv to the overlayBody
	overlayBody.appendChild(overlayContainerDiv);

	overlayContainer.appendChild(overlayHeader);
	overlayContainer.appendChild(overlayBody);

	// Append overlay container to the body
	document.body.appendChild(overlayContainer);

	// Show overlay
	overlayContainer.style.display = 'block';

	function addRowToTable(rowData, table) {
		const newRow = document.createElement('tr');
		newRow.style.borderBottom = '10px solid transparent';

		const nameCell = document.createElement('td');
		const hpCell = document.createElement('td');
		const acCell = document.createElement('td');

		const pcButton = document.createElement('button');

		//ensure the url is the correct input
		const regex = /^https:\/\/www\.dndbeyond\.com\/characters\/\d+$/;
		const url = rowData.sheet_url.trim();

		if (regex.test(url)) {
			pcButton.textContent = rowData.name;
		} else {
			pcButton.textContent = rowData.name + '  ⚠️';
		}

		pcButton.style.backgroundColor = "white";
		pcButton.style.color = "black";
		pcButton.style.padding = "5px";
		pcButton.style.border = "1px solid black";
		pcButton.style.color = "#6385C1";
		pcButton.style.borderRadius = '5px';
		pcButton.style.cursor = "pointer";
		pcButton.style.fontSize = "13px";

		nameCell.appendChild(pcButton);
		hpCell.textContent = `${rowData.hitpoints - rowData.damage}/${rowData.hitpoints}`;
		acCell.textContent = rowData.armor_class;

		newRow.appendChild(nameCell);
		newRow.appendChild(hpCell);
		newRow.appendChild(acCell);

		table.appendChild(newRow);

		const buttonIndex = Array.isArray(adventureData.characters.character) ? table.rows.length - 2 : 0;

		pcButton.addEventListener('click', function () {
			const characterSheetId = rowData.sheet_url.split('/')[4];

			chrome.runtime.sendMessage({ action: 'fetchCharacterInfo', characterId: characterSheetId, buttonIndex: buttonIndex }, function (response) {
				const characterInfo = response.characterInfo;

				// Access the correct adventureData based on the button index
				var clickedCharacter;
				if (buttonIndex > 0) {
					clickedCharacter = adventureData.characters.character[buttonIndex];
				} else {
					clickedCharacter = adventureData.characters.character;
				}

				const character = { "characters": { "character": [clickedCharacter] } };

				overlayContainer.style.display = 'none';
				characterSheetOverlayOpen = false;

				const characterSheetOverlay = document.getElementById('customOverlay');
				if (characterSheetOverlay) {
					characterSheetOverlay.remove();
				}

				chrome.storage.local.get(['characterData'], function (result) {
                    characterData = result.characterData;
				});

				createCharacterSheet(character, "DM");
			});
		});
	}
}

function setupAdventureUI(adventureData) {
	const container = document.querySelector('.topbar .btn-group');
	const viewCharacter = document.createElement('button');

	viewCharacter.classList.add('btn', 'btn-primary', 'btn-xs');
	container.prepend(viewCharacter);

	if (adventureData["@is_dm"] === "yes") {
		viewCharacter.textContent = "Player Character Sheets";
	} else {
		viewCharacter.textContent = "Character Sheet";

		// Only create and add the Common Actions button if the user is not a DM
		const viewCommonActions = document.createElement('button');
		viewCommonActions.classList.add('btn', 'btn-primary', 'btn-xs');
		viewCommonActions.textContent = "Common Actions";
		viewCommonActions.id = "commonActionsButton";
		container.prepend(viewCommonActions);

		viewCommonActions.addEventListener('click', function (event) {
			event.preventDefault();
			if (CommonActionMenuOpen) return;

			// Fetch fresh data from the server like in the original code
			const urlWithJsonOutput = window.location.href + "?output=json";
			fetchJsonDataFromUrl(urlWithJsonOutput)
				.then(freshData => {
					freshData = freshData.adventure;
					createCommonAction(freshData);
				})
				.catch(error => {
					createCommonAction(adventureData);
				});
		});
	}

	viewCharacter.addEventListener('click', function (event) {
		event.preventDefault();

		if (adventureData["@is_dm"] === "yes") {
			showDmView(false, adventureData);
		} else {
			createCharacterSheet(adventureData);
		}
	});
}

function createCommonAction(adventureData) {
	if (CommonActionMenuOpen != false) {
		return;
	}

	const topbar = document.querySelector('.topbar');
	let overlayContainer = document.createElement('div');
	overlayContainer.id = 'customCommonActionMenu';
	overlayContainer.classList.add('panel', 'panel-primary');
	overlayContainer.style.display = 'block';
	overlayContainer.style.position = 'fixed';
	overlayContainer.style.right = '178px';
	overlayContainer.style.backgroundColor = '#d0d0d0';
	overlayContainer.style.zIndex = '1012';
	overlayContainer.style.width = "254.2px";
	overlayContainer.style.position = "absolute";
	overlayContainer.style.border = "1px solid #808080";
	overlayContainer.style.borderRadius = '4px';
	overlayContainer.style.boxShadow = '10px 10px 10px';
	overlayContainer.style.padding = '-5px';
	overlayContainer.style.paddingBottom = '-150px';
	overlayContainer.style.boxSizing = "border-box";

	const style = document.createElement('style');
	// Replace the current style.innerHTML in the createCommonAction function with this:
	style.innerHTML = `
    .check, .saving-throw, .actions, .spells-extention, .usable-items{
        width: 224.2px;
        margin-bottom: 5px;
    }

    .menu-item {
        position: relative;
        width: 100%;
        text-align: left;
        margin-bottom: 5px;
    }

    .menu-item > button::after {
        content: '◀';
        float: left;
        font-size: 0.8em;
        margin-top: 3px;
    }

    .submenu {
        position: absolute;
        right: 100%;
        top: 0;
        background-color: #d0d0d0;
        border: 1px solid #808080;
        border-radius: 4px;
        box-shadow: 5px 5px 5px rgba(0,0,0,0.2);
        z-index: 1014;
        padding: 5px;
        visibility: hidden;
        pointer-events: none;
        opacity: 0;
        transition: opacity ${Number(SUBMENU_APPEAR_TRANSITION)}s ease, visibility ${Number(SUBMENU_APPEAR_TRANSITION)}s ease;
    }

    .submenu.show {
        visibility: visible;
        opacity: 1;
        pointer-events: auto;
    }

    .menu-item::after {
        content: '';
        position: absolute;
        top: 0;
        right: -20px;
        width: 20px;
        height: 100%;
    }

    .submenu::before {
        content: '';
        position: absolute;
        top: 0;
        right: -10px;
        width: 10px;
        height: 100%;
    }

    .menu-item:hover .submenu {
        display: block;
    }

    .submenu:hover {
        display: block;
    }

    .submenu-item {
        height: 20px;
        width: 152.1px;
        cursor: pointer;
        white-space: normal;
        word-wrap: normal;
    }

    .submenu hr {
        margin: 5px;
        border-top: 1px solid #dee2e6;
    }

    .submenu-item-button {
        display: flex;
        align-items: flex-start;
        padding-top: 0;
        padding-right: 0;
    }
`;
	document.head.appendChild(style);

	//build structure of the menu
	const overlayBody = document.createElement('div');
	overlayBody.classList.add('panel-body');
	overlayBody.innerHTML = `
        <div class="menu-container">
            <div class="menu-item">
                <button class="btn btn-default btn-sm check">Checks</button>
                <div class="submenu" id="checks">
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm" data-action="Strength Check"><b>Strength</b>&nbsp;Check</button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm" data-action="Dexterity Check"><b>Dexterity</b>&nbsp;Check</button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm" data-action="Constitution Check"><b>Constitution</b>&nbsp;Check</button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm" data-action="Intelligence Check"><b>Intelligence</b>&nbsp;Check</button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm" data-action="Wisdom Check"><b>Wisdom</b>&nbsp;Check</button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm" data-action="Charisma Check"><b>Charisma</b>&nbsp;Check</button>
                    <hr>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Acrobatics</b> &nbsp;<small>(Dex)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Animal Handling</b> &nbsp;<small>(Wis)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Arcana</b>&nbsp; <small>(Int)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Athletics</b> &nbsp;<small>(Str)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Deception</b> &nbsp;<small>(Cha)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>History</b> &nbsp;<small>(Int)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Insight</b> &nbsp;<small>(Wis)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Intimidation</b> &nbsp;<small>(Cha)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Investigation</b>&nbsp; <small>(Int)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Medicine</b> &nbsp;<small>(Wis)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Nature</b>&nbsp; <small>(Int)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Perception</b> &nbsp;<small>(Wis)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Performance</b> &nbsp;<small>(Cha)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Persuasion</b> &nbsp;<small>(Cha)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Religion</b> &nbsp;<small>(Int)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Sleight of Hand</b>&nbsp; <small>(Dex)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Stealth</b> &nbsp;<small>(Dex)</small></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Survival</b> &nbsp;<small>(Wis)</small></button>
                </div>
            </div>
            <div class="menu-item">
                <button class="btn btn-default btn-sm saving-throw">Saving Throw</button>
                <div class="submenu" id="saving-throws">
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Strength</b></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Dexterity</b></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Constitution</b></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Intelligence</b></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Wisdom</b></button>
                    <button class="submenu-item submenu-item-button btn btn-default btn-sm"><b>Charisma</b></button>
                </div>
            </div>
            <div class="menu-item">
                <button class="btn btn-default btn-sm actions">Actions</button>
                <div class="submenu" title="View all your character's actions that they can take turning combat." id="actions">
                </div>
            </div>
        </div>
    `;

	overlayContainer.appendChild(overlayBody);
	topbar.appendChild(overlayContainer);

	addTitlesToAllButtons();

	if (commonActionClickListener) {
		document.removeEventListener('click', commonActionClickListener);
	}

	commonActionClickListener = function (event) {
		// Only remove if clicking OUTSIDE the menu
		if (!overlayContainer.contains(event.target)) {
			overlayContainer.remove();
			CommonActionMenuOpen = false;
			document.removeEventListener('click', commonActionClickListener);
			commonActionClickListener = null;
		}
	};

	document.addEventListener('click', commonActionClickListener);

	//Shows the submenu applying the "show" class & ensures that there are no other submenus already visible
	document.querySelectorAll('.menu-item').forEach(item => {
		item.addEventListener('mouseenter', () => {
			// Hide all other submenus first
			document.querySelectorAll('.submenu.show').forEach(openSubmenu => {
				if (openSubmenu !== item.querySelector('.submenu')) {
					openSubmenu.classList.remove('show');
				}
			});

			// Then show this submenu
			const submenu = item.querySelector('.submenu');
			if (submenu) {
				submenu.classList.add('show');
			}
		});
	});

	//this ensures the submenu remains visible for "SUBMENU_REMAIN_TRANSITION" in miliseconds
	//which is helpful for those that are too fast with their mouse.
	document.querySelectorAll('.submenu').forEach(submenu => {
		let hideTimeout;
		submenu.addEventListener('mouseleave', () => {
			hideTimeout = setTimeout(() => {
				submenu.classList.remove('show');
			}, SUBMENU_REMAIN_TRANSITION);
		});
		submenu.addEventListener('mouseenter', () => {
			clearTimeout(hideTimeout);
		});
	});

	CommonActionMenuOpen = true;

	const actions = document.getElementById('actions');

	document.querySelectorAll('.submenu-item-button').forEach(button => {
		button.addEventListener('click', function (event) {
			const target = event.target.closest('button');
			if (!target) return;

			const buttonText = target.cloneNode(true);
			buttonText.querySelector('small')?.remove();
			const action = buttonText.textContent.trim();

			const actionData = target.getAttribute('data-action');

			switch (actionData) {
				//ability checks in the common action menu
				case 'Strength Check':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.AbilityScores.Modifier.Strength}`, event);
					break;
				case 'Dexterity Check':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					console.log(`1d20+${characterData.AbilityScores.Modifier.Dexterity}`);
					roll_dice(`1d20+${characterData.AbilityScores.Modifier.Dexterity}`, event);
					break;
				case 'Constitution Check':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.AbilityScores.Modifier.Constitution}`, event);
					break;
				case 'Intelligence Check':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.AbilityScores.Modifier.Intelligence}`, event);
					break;
				case 'Wisdom Check':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.AbilityScores.Modifier.Wisdom}`, event);
					break;
				case 'Charisma Check':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.AbilityScores.Modifier.Charisma}`, event);
					break;
			}

			switch (action) {
				//saving throws in the common action menu
				case 'Strength':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.SavingThrows.Strength.total}`, event);
					break;
				case 'Dexterity':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.SavingThrows.Dexterity.total}`, event);
					break;
				case 'Constitution':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.SavingThrows.Constitution.total}`, event);
					break;
				case 'Intelligence':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.SavingThrows.Intelligence.total}`, event);
					break;
				case 'Wisdom':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.SavingThrows.Wisdom.total}`, event);
					break;
				case 'Charisma':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.SavingThrows.Charisma.total}`, event);
					break;

				//checks
				case 'Acrobatics':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Acrobatics.totalModifier}`, event);
					break;
				case 'Animal Handling':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills['Animal Handling'].totalModifier}`, event);
					break;
				case 'Arcana':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Arcana.totalModifier}`, event);
					break;
				case 'Athletics':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Athletics.totalModifier}`, event);
					break;
				case 'Deception':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Deception.totalModifier}`, event);
					break;
				case 'History':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.History.totalModifier}`, event);
					break;
				case 'Insight':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Insight.totalModifier}`, event);
					break;
				case 'Intimidation':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Intimidation.totalModifier}`, event);
					break;
				case 'Investigation':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Investigation.totalModifier}`, event);
					break;
				case 'Medicine':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Medicine.totalModifier}`, event);
					break;
				case 'Nature':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Nature.totalModifier}`, event);
					break;
				case 'Perception':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Perception.totalModifier}`, event);
					break;
				case 'Performance':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Performance.totalModifier}`, event);
					break;
				case 'Persuasion':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Persuasion.totalModifier}`, event);
					break;
				case 'Religion':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Religion.totalModifier}`, event);
					break;
				case 'Sleight of Hand':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills['Sleight of Hand'].totalModifier}`, event);
					break;
				case 'Stealth':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Stealth.totalModifier}`, event);
					break;
				case 'Survival':
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(`1d20+${characterData.Skills.Survival.totalModifier}`, event);
					break;
				default:
					break;
			}

		});
	});

	var spellAttackButton = document.createElement('button');
	spellAttackButton.id = "test";
	spellAttackButton.textContent = "Spell Attack";
	spellAttackButton.style.fontWeight = 'bold';
	spellAttackButton.classList.add('submenu-item', 'submenu-item-button', 'btn', 'btn-default', 'btn-sm');

	let spellAttack;

	if (characterData.Classes[0].Definition.Name === "Sorcerer") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
	} else if (characterData.Classes[0].Definition.Name === "Wizard") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Intelligence;
	} else if (characterData.Classes[0].Definition.Name === "Cleric") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
	} else if (characterData.Classes[0].Definition.Name === "Druid") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
	} else if (characterData.Classes[0].Definition.Name === "Paladin") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
	} else if (characterData.Classes[0].Definition.Name === "Ranger") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
	} else if (characterData.Classes[0].Definition.Name === "Bard") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
	} else if (characterData.Classes[0].Definition.Name === "Warlock") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
	} else if (characterData.Classes[0].Definition.Name === "Artificer") {
		spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Intelligence;
	}

	spellAttackButton.title = "+" + spellAttack;
	actions.appendChild(spellAttackButton);

	spellAttackButton.addEventListener('click', function (event) {
		document.body.prepend(document.querySelector('div#dice-box'));
		document.querySelector('div#dice-box').style.zIndex = '';
		overlayContainer.remove();
		CommonActionMenuOpen = false;
		roll_dice(`1d20+${spellAttack}`, event);
	});

	for (let i = 0; i < Object.keys(characterData.Inventory).length; i++) {
		if (characterData.Inventory[i].Definition.FilterType === "Weapon" || characterData.Inventory[i].Definition.FilterType === "Rod" || characterData.Inventory[i].Definition.FilterType === "Staff") {
			const name = characterData.Inventory[i].Definition.Name;
			const range = "Range: " + (characterData.Inventory[i].Definition.Range || 5) + "/" + (characterData.Inventory[i].Definition.LongRange || 5) + "ft.";
			const attackRoll = characterData.Inventory[i].Definition.AttackRoll;
			const damage = characterData.Inventory[i].Definition.DamageRoll;

			const weaponButton = document.createElement('button');
			weaponButton.textContent = name;
			weaponButton.title = range + " - Attack Roll: " + attackRoll + " - Damage: " + damage + " - Double click for damage roll";
			weaponButton.classList.add('submenu-item', 'submenu-item-button', 'btn', 'btn-default', 'btn-sm');
			weaponButton.style.fontWeight = 'bold';

			let clickTimeout;

			weaponButton.addEventListener('click', function (event) {
				if (clickTimeout) {
					clearTimeout(clickTimeout);
					clickTimeout = null;
					document.body.prepend(document.querySelector('div#dice-box'));
					document.querySelector('div#dice-box').style.zIndex = '';
					// Handle double click
					overlayContainer.remove();
					CommonActionMenuOpen = false;
					roll_dice(damage);
				} else {
					clickTimeout = setTimeout(() => {
						clickTimeout = null;
						document.body.prepend(document.querySelector('div#dice-box'));
						document.querySelector('div#dice-box').style.zIndex = '';
						overlayContainer.remove();
						CommonActionMenuOpen = false;
						roll_dice(attackRoll, event);
					}, 200);
				}
			});

			actions.appendChild(weaponButton);
		}
	}
}

function addTitlesToAllButtons() {
	// Set titles for ability checks
	document.querySelectorAll('[data-action="Strength Check"]').forEach(button => {
		button.title = `Modifier: ${characterData.AbilityScores.Modifier.Strength >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Strength}`;
	});
	document.querySelectorAll('[data-action="Dexterity Check"]').forEach(button => {
		button.title = `Modifier: ${characterData.AbilityScores.Modifier.Dexterity >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Dexterity}`;
	});
	document.querySelectorAll('[data-action="Constitution Check"]').forEach(button => {
		button.title = `Modifier: ${characterData.AbilityScores.Modifier.Constitution >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Constitution}`;
	});
	document.querySelectorAll('[data-action="Intelligence Check"]').forEach(button => {
		button.title = `Modifier: ${characterData.AbilityScores.Modifier.Intelligence >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Intelligence}`;
	});
	document.querySelectorAll('[data-action="Wisdom Check"]').forEach(button => {
		button.title = `Modifier: ${characterData.AbilityScores.Modifier.Wisdom >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Wisdom}`;
	});
	document.querySelectorAll('[data-action="Charisma Check"]').forEach(button => {
		button.title = `Modifier: ${characterData.AbilityScores.Modifier.Charisma >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Charisma}`;
	});

	// Set titles for saving throws
	document.querySelector('#saving-throws button:nth-child(1)').title =
		`Modifier: ${characterData.SavingThrows.Strength.total >= 0 ? '+' : ''}${characterData.SavingThrows.Strength.total}`;
	document.querySelector('#saving-throws button:nth-child(2)').title =
		`Modifier: ${characterData.SavingThrows.Dexterity.total >= 0 ? '+' : ''}${characterData.SavingThrows.Dexterity.total}`;
	document.querySelector('#saving-throws button:nth-child(3)').title =
		`Modifier: ${characterData.SavingThrows.Constitution.total >= 0 ? '+' : ''}${characterData.SavingThrows.Constitution.total}`;
	document.querySelector('#saving-throws button:nth-child(4)').title =
		`Modifier: ${characterData.SavingThrows.Intellegence.total >= 0 ? '+' : ''}${characterData.SavingThrows.Intellegence.total}`;
	document.querySelector('#saving-throws button:nth-child(5)').title =
		`Modifier: ${characterData.SavingThrows.Wisdom.total >= 0 ? '+' : ''}${characterData.SavingThrows.Wisdom.total}`;
	document.querySelector('#saving-throws button:nth-child(6)').title =
		`Modifier: ${characterData.SavingThrows.Charisma.total >= 0 ? '+' : ''}${characterData.SavingThrows.Charisma.total}`;

	const skillsMapping = {
		'Acrobatics': characterData.Skills.Acrobatics.totalModifier,
		'Animal Handling': characterData.Skills['Animal Handling'].totalModifier,
		'Arcana': characterData.Skills.Arcana.totalModifier,
		'Athletics': characterData.Skills.Athletics.totalModifier,
		'Deception': characterData.Skills.Deception.totalModifier,
		'History': characterData.Skills.History.totalModifier,
		'Insight': characterData.Skills.Insight.totalModifier,
		'Intimidation': characterData.Skills.Intimidation.totalModifier,
		'Investigation': characterData.Skills.Investigation.totalModifier,
		'Medicine': characterData.Skills.Medicine.totalModifier,
		'Nature': characterData.Skills.Nature.totalModifier,
		'Perception': characterData.Skills.Perception.totalModifier,
		'Performance': characterData.Skills.Performance.totalModifier,
		'Persuasion': characterData.Skills.Persuasion.totalModifier,
		'Religion': characterData.Skills.Religion.totalModifier,
		'Sleight of Hand': characterData.Skills['Sleight of Hand'].totalModifier,
		'Stealth': characterData.Skills.Stealth.totalModifier,
		'Survival': characterData.Skills.Survival.totalModifier
	};

	const skillButtons = document.querySelectorAll('#checks button:not([data-action])');
	skillButtons.forEach(button => {
		const buttonText = button.querySelector('b')?.textContent.trim();
		if (buttonText && skillsMapping[buttonText] !== undefined) {
			const mod = skillsMapping[buttonText];
			button.title = `Modifier: ${mod >= 0 ? '+' : ''}${mod}`;
		}
	});

	document.querySelectorAll('.submenu button').forEach(button => {
		button.style.pointerEvents = 'auto';
	});
}

function createCharacterSheet(adventureData, DM=null) {
	if (characterSheetOpen) return;

	//Create overlay container
	const overlayContainer = document.createElement('div');
	overlayContainer.id = 'customOverlay';
	overlayContainer.classList.add('panel', 'panel-primary');
	overlayContainer.style.display = 'block';
	overlayContainer.style.position = 'fixed';
	overlayContainer.style.top = '40px';
	overlayContainer.style.left = '15px';
	overlayContainer.style.marginBottom = '0';
	overlayContainer.style.backgroundColor = 'rgba(255,255,255, 1)';
	overlayContainer.style.zIndex = '1';
	overlayContainer.style.width = "465px";

	// Character Information
	let characterHidden = "";
	let currentCauldronHitPoints = 0;
	let currentArmourClass = 0;
	let totalHitPoints = 0;
	let tempHitPoints = characterData.TempHitPoints;
	let hitDiceTotal = characterData.Classes[0].Level;
	let hitDiceType = "d" + characterData.Classes[0].Definition.HitDice;
	let hitDiceUsed = characterData.Classes[0].HitDiceUsed || 0;

	// Get character's speed from race data
	let characterSpeed = characterData.Race.Speed || 30;

	// Find character in adventure data
	let currentCharacter = null;

	// character detection logic
	if (adventureData.characters) {
		const characters = Array.isArray(adventureData.characters.character)
			? adventureData.characters.character
			: [adventureData.characters.character];

		for (const character of characters) {
			if (character && character.name === characterData.Name) {
				currentCharacter = character;

				if (character.hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}

		if (currentCharacter) {
			currentCauldronHitPoints = (Number(currentCharacter.hitpoints || 0) -
				Number(currentCharacter.damage || 0));
			currentArmourClass = (Number(currentCharacter.armor_class || 0));
			totalHitPoints = Number(currentCharacter.hitpoints || 0);
		}
	}

	if (DM == "DM") {
		currentArmourClass = characterData.ArmourClass;
		totalHitPoints = characterData.HitPoints;
		if (adventureData.characters.character.length > 0) {
			for (let i = 0; i < adventureData.characters.character.length; i++) {
				if (adventureData.characters.character[i].sheet_url.includes(characterData.Id)) {
					currentCauldronHitPoints = adventureData.characters.character[i].hitpoints;
					break;
				}
			}
		} else {
            currentCauldronHitPoints = adventureData.characters.character.hitpoints;
		}
	}

	//Header
	const overlayHeader = document.createElement('div');
	overlayHeader.classList.add('panel-heading');
	overlayHeader.id = "titleBar";
	overlayHeader.innerHTML = `
        ${characterData.Name} - Character ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>
    `;

	//Close button
	const closeButton = overlayHeader.querySelector('.close');
	closeButton.addEventListener('click', function () {
		overlayContainer.remove();
		characterSheetOpen = false;

		if (window._hpMonitorInterval) {
			clearInterval(window._hpMonitorInterval);
			window._hpMonitorInterval = null;
		}
	});

	const overlayBody = document.createElement('div');
	overlayBody.classList.add('panel-body');

	overlayBody.innerHTML = `
		<div id="overlayContainer" style="display: flex;">
			<div class="ability-panel">
				<div class="section-label" style="font-size: 10px; color: #666; text-align: center; margin-bottom: 5px;">ABILITY SCORES</div>
				<h5 style="font-weight: bold;">STR</h5>
				<button id="strButton" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="button-modification">${characterData.AbilityScores.Score.Strength} (${characterData.AbilityScores.Modifier.Strength >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Strength})</button>
				<h5 style="font-weight: bold;">DEX</h5>
				<button id="dexButton" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="button-modification">${characterData.AbilityScores.Score.Dexterity} (${characterData.AbilityScores.Modifier.Dexterity >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Dexterity})</button>
				<h5 style="font-weight: bold;">CON</h5>
				<button id="conButton" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="button-modification">${characterData.AbilityScores.Score.Constitution} (${characterData.AbilityScores.Modifier.Constitution >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Constitution})</button>
				<h5 style="font-weight: bold;">INT</h5>
				<button id="intButton" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="button-modification">${characterData.AbilityScores.Score.Intelligence} (${characterData.AbilityScores.Modifier.Intelligence >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Intelligence})</button>
				<h5 style="font-weight: bold;">WIS</h5>
				<button id="wisButton" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="button-modification">${characterData.AbilityScores.Score.Wisdom} (${characterData.AbilityScores.Modifier.Wisdom >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Wisdom})</button>
				<h5 style="font-weight: bold;">CHA</h5>
				<button id="chaButton" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="button-modification">${characterData.AbilityScores.Score.Charisma} (${characterData.AbilityScores.Modifier.Charisma >= 0 ? '+' : ''}${characterData.AbilityScores.Modifier.Charisma})</button>
			</div>

			<div class="hit-dice-container">
				<div class="rest-buttons">
					<button id="shortRest" class="btn btn-primary btn-xs">Short Rest</button>
					<button id="longRest" class="btn btn-primary btn-xs" >Long Rest</button>
				</div>
				<div class="hit-dice-label">Hit Dice</div>
				<div class="hit-dice-display">
					<div class="hit-dice-type">${hitDiceType}</div>
					<div class="hit-dice-fraction">
						<div class="hit-dice-count">${hitDiceTotal - hitDiceUsed}</div>
						<div>/</div>
						<div class="hit-dice-count">${hitDiceTotal}</div>
					</div>
				</div>
				<button class="roll-dice" id="rollHitDie" title="Roll a hit die to recover HP">Roll</button>
			</div>
    
			<div id="SkillListDiv" class="skills-panel">
				<div class="section-label" style="font-size: 10px; color: #666; text-align: center; margin-bottom:5px;">ABILITY CHECKS</div>
				<ul id="skillList"></ul>
			</div>
    
			<div class="saving-throws-panel">
				<div class="section-label" style="font-size: 10px; color: #666; text-align: center; margin-bottom: 5px;">SAVING THROWS</div>
				<ul id="savingThrowElement"></ul>
			</div>
        
			<div class="proficiencies-section">
				<div type="text" id="proficiencies" title="View proficiencies and languages">Profs.</div>
				<div class="proficiency-indicator"></div>
			</div>

			<div class="dragPushLift">
				<p>Drag<br>Push<br>Lift <code>${characterData.DragPushLift}</code> Lbs</p>
			</div>

			<div class="rage-container"></div>

			<div class="bard-container" id="bard-container"></div>
    
			<div class="Character-menu-container" style="margin-top: 125px; height: 40px; margin-left: 0px;">
				<div class="character-menu menu-panel">
					<button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="margin-top: 10px;">Actions</button>
					<button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn">Bio</button>
					<button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn">Character</button>
					<button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn">Features</button>
					<button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn">Inventory</button>
					<button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn">Spells</button>
					<button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
				</div>
			</div>
    
			<div class="armourSection">
				<input type="text" id="armourClass" placeholder="0" title="Armour Class" class="stats-display input-button-modification" disabled="true" value="${currentArmourClass}">
				<label class="stats-label">Armor Class</label>
			</div>
        
			<div class="speed-section">
				<input type="text" id="speed" placeholder="30" title="Movement Speed" class="speed-display input-button-modification" disabled="true" value="${characterSpeed}">
				<label class="speed-label">Speed</label>
			</div>

			<div class="hp-container">
				<div class="hp-inputs-container">
					<input disabled type="text" max="${totalHitPoints}" class="current-hp-input input-button-modification" value="${currentCauldronHitPoints}">
					<input disabled type="text" class="max-hp-input input-button-modification" value="${totalHitPoints}">
					<span class="hp-slash">／</span>
				</div>
				<label class="hp-label">HP</label>
			</div>
			<div class="temp-hp-container">
				<label class="temp-hp-label">Temp</label>
				<input type="number" id="tempHitPoints" min="0" max="990" class="temp-hp-input input-button-modification" value="${Number(tempHitPoints)}">
			</div>
		</div>
	`;

	//inspiration
	const isBard = characterData.Classes[0]?.Definition?.Name === "Bard";

	if (isBard) {
		const bardicContainer = overlayBody.querySelector('#bard-container');
		bardicContainer.style.display = "block";

		// Bardic Inspiration
		let bardicDie = "d6";
		let maxInspiration = 0;
		let usedInspiration = 0;
		let inspirationActionKey = null;

		const bardLevel = characterData.Classes[0].Level;
		if (bardLevel >= 15) {
			bardicDie = "d12";
		} else if (bardLevel >= 10) {
			bardicDie = "d10";
		} else if (bardLevel >= 5) {
			bardicDie = "d8";
		}

		// inspiration uses
		maxInspiration = Math.max(1, characterData.AbilityScores.Modifier.Charisma);

		// Check for College of Lore - Additional Magical Secrets feature
		const hasLoreCollege = characterData.Classes[0]?.SubClassDefinition?.Name === "College of Lore";

		for (const key in characterData.Actions) {
			if (characterData.Actions[key].Name && characterData.Actions[key].Name.includes("Bardic Inspiration")) {
				if (characterData.Actions[key].LimitedUse) {
					usedInspiration = characterData.Actions[key].LimitedUse.NumberUsed || 0;
					inspirationActionKey = key;
				}
				break;
			}
		}

		// Bardic Inspiration header
		const bardicHeader = document.createElement('div');
		bardicHeader.textContent = "BARDIC INSPIR-\nATION";
		bardicHeader.style.fontWeight = 'bold';
		bardicHeader.style.fontSize = '12px';
		bardicHeader.style.color = 'rgb(51, 102, 153)';
		bardicContainer.appendChild(bardicHeader);

		// Die type display
		const dieType = document.createElement('div');
		dieType.textContent = bardicDie;
		dieType.style.fontWeight = 'bold';
		dieType.style.fontSize = '14px';
		dieType.style.margin = '4px 0';
		bardicContainer.appendChild(dieType);

		// Increase button
		const increaseBtn = document.createElement('button');
		increaseBtn.innerHTML = "+";
		increaseBtn.className = "skill-button-modification";
		increaseBtn.style.padding = "0px 5px";
		increaseBtn.style.margin = "4px auto";
		increaseBtn.style.display = "block";
		increaseBtn.title = "Recover Bardic Inspiration";
		increaseBtn.disabled = usedInspiration <= 0;
		bardicContainer.appendChild(increaseBtn);

		// Counter display
		const inspirationCount = document.createElement('span');
		inspirationCount.textContent = `${maxInspiration - usedInspiration}/${maxInspiration}`;
		inspirationCount.style.fontWeight = 'bold';
		inspirationCount.style.display = 'block';
		inspirationCount.style.margin = '4px 0';
		bardicContainer.appendChild(inspirationCount);

		// Decrease button
		const decreaseBtn = document.createElement('button');
		decreaseBtn.innerHTML = "−";
		decreaseBtn.className = "skill-button-modification";
		decreaseBtn.style.padding = "0px 5px";
		decreaseBtn.style.margin = "4px auto";
		decreaseBtn.style.display = "block";
		decreaseBtn.title = "Use Bardic Inspiration";
		decreaseBtn.disabled = usedInspiration >= maxInspiration;
		bardicContainer.appendChild(decreaseBtn);

		// Event listeners for the buttons
		decreaseBtn.addEventListener('click', function () {
			if (usedInspiration < maxInspiration) {
				usedInspiration++;
				inspirationCount.textContent = `${maxInspiration - usedInspiration}/${maxInspiration}`;
				decreaseBtn.disabled = usedInspiration >= maxInspiration;
				increaseBtn.disabled = false;

				if (inspirationActionKey && characterData.Actions[inspirationActionKey]) {
					characterData.Actions[inspirationActionKey].LimitedUse.NumberUsed = usedInspiration;

					chrome.storage.local.set({ 'characterData': characterData });

					chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
						if (result.activeCharacterId && result.characters &&
							result.characters[result.activeCharacterId]) {
							if (result.characters[result.activeCharacterId].Actions &&
								result.characters[result.activeCharacterId].Actions[inspirationActionKey]) {
								result.characters[result.activeCharacterId].Actions[inspirationActionKey].LimitedUse.NumberUsed =
									usedInspiration;

								chrome.storage.local.set({ 'characters': result.characters });
							}
						}
					});
				}
			}
		});

		increaseBtn.addEventListener('click', function () {
			if (usedInspiration > 0) {
				usedInspiration--;
				inspirationCount.textContent = `${maxInspiration - usedInspiration}/${maxInspiration}`;
				increaseBtn.disabled = usedInspiration <= 0;
				decreaseBtn.disabled = false;

				if (inspirationActionKey && characterData.Actions[inspirationActionKey]) {
					characterData.Actions[inspirationActionKey].LimitedUse.NumberUsed = usedInspiration;

					chrome.storage.local.set({ 'characterData': characterData });

					chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
						if (result.activeCharacterId && result.characters &&
							result.characters[result.activeCharacterId]) {
							if (result.characters[result.activeCharacterId].Actions &&
								result.characters[result.activeCharacterId].Actions[inspirationActionKey]) {
								result.characters[result.activeCharacterId].Actions[inspirationActionKey].LimitedUse.NumberUsed =
									usedInspiration;

								chrome.storage.local.set({ 'characters': result.characters });
							}
						}
					});
				}
			}
		});

		// Tooltip description
		const bardicDescription = document.createElement('div');
		bardicDescription.className = 'bardic-description';
		bardicDescription.style.position = 'absolute';
		bardicDescription.style.display = 'none';
		bardicDescription.style.backgroundColor = 'white';
		bardicDescription.style.border = '1px solid #ccc';
		bardicDescription.style.borderRadius = '4px';
		bardicDescription.style.padding = '8px';
		bardicDescription.style.zIndex = '1050';
		bardicDescription.style.width = '250px';
		bardicDescription.style.fontSize = '12px';
		bardicDescription.style.textAlign = 'left';
		bardicDescription.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

		// Description text
		let descText = `Bardic Inspiration (${bardicDie}):\n`;
		descText += "• As a Bonus Action, give inspiration to a creature within 60 ft.\n";
		descText += `• Target can add ${bardicDie} to one ability check, attack roll, or saving throw within 10 minutes.\n`;

		if (bardLevel >= 5) {
			descText += "• Font of Inspiration: Regain all uses on a short or long rest.\n";
		} else {
			descText += "• Regain all uses on a long rest.\n";
		}

		if (hasLoreCollege && bardLevel >= 6) {
			descText += "\nCutting Words:\n";
			descText += `• Use reaction to subtract ${bardicDie} from an enemy's attack roll, ability check, or damage roll.`;
		}

		bardicDescription.innerText = descText;

		// Show/hide tooltip on hover
		bardicContainer.addEventListener('mouseenter', function () {
			const rect = bardicContainer.getBoundingClientRect();
			bardicDescription.style.top = `${rect.top + window.scrollY + rect.height}px`;
			bardicDescription.style.left = `${rect.left + window.scrollX - 150}px`;
			bardicDescription.style.display = 'block';
		});

		bardicContainer.addEventListener('mouseleave', function () {
			bardicDescription.style.display = 'none';
		});

		document.body.appendChild(bardicDescription);
	} else {
		const bardicContainer = overlayBody.querySelector('#bard-container');
        bardicContainer.style.display = "none";
	}

	//rage (only appears if the character uses rage)
	const hasRage = characterData.Classes &&
		characterData.Classes[0]?.Definition?.Name === "Barbarian" ||
		(characterData.Actions &&
			Object.values(characterData.Actions).some(action => action.Name && action.Name.includes("Rage")));

	if (hasRage) {
		let maxRages = 3;
		let usedRages = 0;
		let rageActionKey = null;

		for (const key in characterData.Actions) {
			if (characterData.Actions[key].Name && characterData.Actions[key].Name.includes("Rage")) {
				if (characterData.Actions[key].LimitedUse && characterData.Actions[key].LimitedUse.MaxUse) {
					maxRages = characterData.Actions[key].LimitedUse.MaxUse;
					usedRages = characterData.Actions[key].LimitedUse.NumberUsed || 0;
					rageActionKey = key;
				}
				break;
			}
		}

		// rage container
		const rageContainer = overlayBody.querySelector('.rage-container');

		// Rage header
		const rageHeader = document.createElement('div');
		rageHeader.textContent = "RAGE";
		rageHeader.style.fontWeight = 'bold';
		rageHeader.style.fontSize = '12px';
		rageHeader.style.color = 'rgb(51, 102, 153)';
		rageContainer.appendChild(rageHeader);

		// Increase button 
		const increaseBtn = document.createElement('button');
		increaseBtn.innerHTML = "+";
		increaseBtn.className = "skill-button-modification";
		increaseBtn.style.padding = "0px 5px";
		increaseBtn.style.margin = "4px auto";
		increaseBtn.style.display = "block";
		increaseBtn.title = "Recover rage";
		increaseBtn.disabled = usedRages <= 0;
		rageContainer.appendChild(increaseBtn);

		// Counter display
		const rageCount = document.createElement('span');
		rageCount.textContent = `${maxRages - usedRages}/${maxRages}`;
		rageCount.style.fontWeight = 'bold';
		rageCount.style.display = 'block';
		rageCount.style.margin = '4px 0';
		rageContainer.appendChild(rageCount);

		// Decrease button
		const decreaseBtn = document.createElement('button');
		decreaseBtn.innerHTML = "−";
		decreaseBtn.className = "skill-button-modification";
		decreaseBtn.style.padding = "0px 5px";
		decreaseBtn.style.margin = "4px auto";
		decreaseBtn.style.display = "block";
		decreaseBtn.title = "Use rage";
		decreaseBtn.disabled = usedRages >= maxRages;
		rageContainer.appendChild(decreaseBtn);

		decreaseBtn.addEventListener('click', function () {
			if (usedRages < maxRages) {
				usedRages++;
				rageCount.textContent = `${maxRages - usedRages}/${maxRages}`;
				decreaseBtn.disabled = usedRages >= maxRages;
				increaseBtn.disabled = false;

				if (rageActionKey && characterData.Actions[rageActionKey]) {
					characterData.Actions[rageActionKey].LimitedUse.NumberUsed = usedRages;

					chrome.storage.local.set({ 'characterData': characterData });

					chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
						if (result.activeCharacterId && result.characters &&
							result.characters[result.activeCharacterId]) {
							if (result.characters[result.activeCharacterId].Actions &&
								result.characters[result.activeCharacterId].Actions[rageActionKey]) {
								result.characters[result.activeCharacterId].Actions[rageActionKey].LimitedUse.NumberUsed =
									usedRages;

								chrome.storage.local.set({ 'characters': result.characters });
							}
						}
					});
				}
			}
		});

		increaseBtn.addEventListener('click', function () {
			if (usedRages > 0) {
				usedRages--;
				rageCount.textContent = `${maxRages - usedRages}/${maxRages}`;
				increaseBtn.disabled = usedRages <= 0;
				decreaseBtn.disabled = false;

				if (rageActionKey && characterData.Actions[rageActionKey]) {
					characterData.Actions[rageActionKey].LimitedUse.NumberUsed = usedRages;

					chrome.storage.local.set({ 'characterData': characterData });

					chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
						if (result.activeCharacterId && result.characters &&
							result.characters[result.activeCharacterId]) {
							if (result.characters[result.activeCharacterId].Actions &&
								result.characters[result.activeCharacterId].Actions[rageActionKey]) {
								result.characters[result.activeCharacterId].Actions[rageActionKey].LimitedUse.NumberUsed =
									usedRages;

								chrome.storage.local.set({ 'characters': result.characters });
							}
						}
					});
				}
			}
		});

		// tooltip
		const rageDescription = document.createElement('div');
		rageDescription.className = 'rage-description';
		rageDescription.style.position = 'absolute';
		rageDescription.style.display = 'none';
		rageDescription.style.backgroundColor = 'white';
		rageDescription.style.border = '1px solid #ccc';
		rageDescription.style.borderRadius = '4px';
		rageDescription.style.padding = '8px';
		rageDescription.style.zIndex = '1050';
		rageDescription.style.width = '250px';
		rageDescription.style.fontSize = '12px';
		rageDescription.style.textAlign = 'left';
		rageDescription.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';

		// rage description text
		let rageDescriptionText = "While raging:";
		rageDescriptionText += "\n• Advantage on Strength checks & saves";
		rageDescriptionText += "\n• +2 damage with melee Strength attacks";
		rageDescriptionText += "\n• Resistance to bludgeoning, piercing, slashing";
		rageDescriptionText += "\n• Cannot cast or concentrate on spells";

		rageDescription.innerText = rageDescriptionText;

		// tooltip on hover
		rageContainer.addEventListener('mouseenter', function () {
			const rect = rageContainer.getBoundingClientRect();
			rageDescription.style.top = `${rect.top + window.scrollY + rect.height}px`;
			rageDescription.style.left = `${rect.left + window.scrollX - 150}px`;
			rageDescription.style.display = 'block';
		});

		rageContainer.addEventListener('mouseleave', function () {
			rageDescription.style.display = 'none';
		});

		document.body.appendChild(rageDescription);
	} else {
		const rageContainer = overlayBody.querySelector('.rage-container');
		rageContainer.style.display = "none";
	}

	//proficiencies
	const profSection = overlayBody.querySelector('.proficiencies-section');

	const profTooltip = document.createElement('div');
	profTooltip.className = 'proficiency-tooltip';

	let proficiencyContent = '';

	//armor proficiencies
	if (characterData.Proficiencys && characterData.Proficiencys.Armour && characterData.Proficiencys.Armour.length > 0) {
		proficiencyContent += '<div class="proficiency-type">';
		proficiencyContent += '<span class="proficiency-type-name">Armor:</span>';
		proficiencyContent += `<span>${characterData.Proficiencys.Armour.join(', ')}</span>`;
		proficiencyContent += '</div>';
	}

	//weapon proficiencies
	if (characterData.Proficiencys && characterData.Proficiencys.Weapons && characterData.Proficiencys.Weapons.length > 0) {
		proficiencyContent += '<div class="proficiency-type">';
		proficiencyContent += '<span class="proficiency-type-name">Weapons:</span>';
		proficiencyContent += `<span>${characterData.Proficiencys.Weapons.join(', ')}</span>`;
		proficiencyContent += '</div>';
	}

	//tools proficiencies
	if (characterData.Proficiencys && characterData.Proficiencys.Tools && characterData.Proficiencys.Tools.length > 0) {
		proficiencyContent += '<div class="proficiency-type">';
		proficiencyContent += '<span class="proficiency-type-name">Tools:</span>';
		proficiencyContent += `<span>${characterData.Proficiencys.Tools.join(', ')}</span>`;
		proficiencyContent += '</div>';
	}

	//languages
	if (characterData.Proficiencys && characterData.Proficiencys.Languages && characterData.Proficiencys.Languages.length > 0) {
		proficiencyContent += '<div class="proficiency-type">';
		proficiencyContent += '<span class="proficiency-type-name">Languages:</span>';
		proficiencyContent += `<span>${characterData.Proficiencys.Languages.join(', ')}</span>`;
		proficiencyContent += '</div>';
	}

	if (!proficiencyContent) {
		proficiencyContent = '<div>No proficiencies found</div>';
	}

	profTooltip.innerHTML = proficiencyContent;
	profSection.appendChild(profTooltip);

	//temp HP event listeners
	const tempHitPointsInput = overlayBody.querySelector('#tempHitPoints');
	if (tempHitPointsInput) {
		tempHitPointsInput.disabled = false;
		tempHitPointsInput.style.pointerEvents = 'auto';
		tempHitPointsInput.style.zIndex = '100'; 

		// Add multiple event listeners to ensure it works
		tempHitPointsInput.addEventListener('mousedown', function (e) {
			e.stopPropagation(); 
		});

		tempHitPointsInput.addEventListener('click', function (e) {
			e.stopPropagation();
		});

		tempHitPointsInput.addEventListener('focus', function () {
			searchInputFocused = true;
		});

		tempHitPointsInput.addEventListener('change', function () {
			const newTempHP = parseInt(this.value) || 0;
			characterData.TempHitPoints = newTempHP;

			chrome.storage.local.set({ 'characterData': characterData });

			chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
				if (result.activeCharacterId && result.characters &&
					result.characters[result.activeCharacterId]) {
					result.characters[result.activeCharacterId].TempHitPoints = newTempHP;
					chrome.storage.local.set({ 'characters': result.characters });
				}
			});
		});
	}

	const rollHitDieButton = overlayBody.querySelector('#rollHitDie');
	rollHitDieButton.addEventListener('click', function (event) {
		if (hitDiceTotal - hitDiceUsed <= 0) {
			return;
		}

		const hitDieSides = characterData.Classes[0].Definition.HitDice;
		const constitutionModifier = characterData.AbilityScores.Modifier.Constitution;

		// Update character data with used hit die
		characterData.Classes[0].HitDiceUsed = (characterData.Classes[0].HitDiceUsed || 0) + 1;
		hitDiceUsed = characterData.Classes[0].HitDiceUsed;

		// Update hit dice display
		const hitDiceFraction = overlayBody.querySelector('.hit-dice-fraction');
		if (hitDiceFraction) {
			hitDiceFraction.innerHTML = `
            <div class="hit-dice-count">${hitDiceTotal - hitDiceUsed}</div>
            <div>/</div>
            <div class="hit-dice-count">${hitDiceTotal}</div>`;
		}

		const rollCommand = `1d${hitDieSides}+${constitutionModifier}`;
		roll_dice(rollCommand);

		chrome.storage.local.set({ 'characterData': characterData });

		// Wait for the roll to finish and appear in the sidebar
		setTimeout(() => {
			const sidebarContent = document.querySelector('.sidebar');
			const currentHitPointsInput = overlayBody.querySelector('.current-hp-input');
			const maxHP = Number(overlayBody.querySelector('.max-hp-input').value);

			if (sidebarContent) {
				const latestRoll = findLatestRoll(sidebarContent);
				if (latestRoll) {
					chrome.runtime.sendMessage({
						type: 'APPLY_HEALING',
						healAmount: latestRoll
					}, (response) => {
						if (response && response.success) {
							let newCurrentHP = Number(currentHitPointsInput.value) + Number(latestRoll);
							if (newCurrentHP > maxHP) {
								newCurrentHP = maxHP;
							}
							currentHitPointsInput.value = newCurrentHP;
						} else {
							console.error('Failed to apply healing:', response?.error);
						}
					});
				} else {
					const healAmount = prompt("Enter the healing amount from your hit die roll:", "");
					if (healAmount && !isNaN(healAmount)) {
						chrome.runtime.sendMessage({
							type: 'APPLY_HEALING',
							healAmount: parseInt(healAmount)
						});

						let newCurrentHP = Number(currentHitPointsInput.value) + Number(healAmount);
						if (newCurrentHP > maxHP) {
							newCurrentHP = maxHP;
						}
						currentHitPointsInput.value = newCurrentHP;
					}
				}
			}
		}, 2000);
	});

	//long rest button
	const longRestButton = overlayBody.querySelector('#longRest');
	longRestButton.addEventListener('click', function () {
		if (confirm("Take a long rest? This will restore your hit points, hit dice, spell slots and other limited use features")) {
			const hitDiceRecovered = Math.max(1, Math.floor(hitDiceTotal / 2));

			let newHitDiceUsed = characterData.Classes[0].HitDiceUsed - hitDiceRecovered;
			if (newHitDiceUsed < 0) newHitDiceUsed = 0;
			characterData.Classes[0].HitDiceUsed = newHitDiceUsed;

			//restore hit dice
			hitDiceUsed = newHitDiceUsed;
			const hitDiceFraction = overlayBody.querySelector('.hit-dice-fraction');
			if (hitDiceFraction) {
				hitDiceFraction.innerHTML = `
            <div class="hit-dice-count">${hitDiceTotal - hitDiceUsed}</div>
            <div>/</div>
            <div class="hit-dice-count">${hitDiceTotal}</div>`;
			}

			//restore HP to max
			const currentHitPointsInput = overlayBody.querySelector('.current-hp-input');
			const maxHP = Number(overlayBody.querySelector('.max-hp-input').value);
			if (currentHitPointsInput) {
				currentHitPointsInput.value = maxHP;

				chrome.runtime.sendMessage({
					type: "APPLY_HEALING",
					healAmount: 1000
				});
			}

			//reset all spell slots
			if (characterData.SpellSlots) {
				for (let i = 0; i < characterData.SpellSlots.length; i++) {
					if (characterData.SpellSlots[i]) {
						characterData.SpellSlots[i].Used = 0;
					}
				}
			}

			// Reset Warlock pact slots if they exist
			if (characterData.Pact) {
				characterData.Pact.SlotsUsed = 0;
			}

			//reset all features that recharge on a long rest
			let featuresRestored = [];

			if (characterData.Actions) {
				for (let i = 0; i < Object.keys(characterData.Actions).length; i++) {
					const action = characterData.Actions[i];
					if (action && action.LimitedUse) {
						// Check for long rest recharge
						if (action.LimitedUse.ResetType === "LongRest" ||
							action.LimitedUse.ResetType === "Long Rest" ||
							!action.LimitedUse.ResetType) {
							action.LimitedUse.NumberUsed = 0;
							featuresRestored.push(action.Name);
						}
					}
				}
			}

			// Update UI
			const rageCounter = document.querySelector('.rage-container span');
			if (rageCounter && featuresRestored.some(name => name.includes('Rage'))) {
				let maxRages = 0;
				for (const key in characterData.Actions) {
					if (characterData.Actions[key].Name && characterData.Actions[key].Name.includes("Rage")) {
						maxRages = characterData.Actions[key].LimitedUse.MaxUse || 0;
						break;
					}
				}
				rageCounter.textContent = `${maxRages}/${maxRages}`;
			}

			// Update UI for bardic inspiration
			const inspirationCounter = document.querySelector('#bard-container span');
			if (inspirationCounter && featuresRestored.some(name => name.includes('Bardic Inspiration'))) {
				const maxInspiration = Math.max(1, characterData.AbilityScores.Modifier.Charisma);
				inspirationCounter.textContent = `${maxInspiration}/${maxInspiration}`;
			}

			chrome.storage.local.set({ 'characterData': characterData });

			// Update the UI for all limited features
			document.querySelectorAll('.usage-tracker').forEach(tracker => {
				const usesLabel = tracker.querySelector('.uses-label');
				const decreaseBtn = tracker.querySelector('button:first-of-type');
				const increaseBtn = tracker.querySelector('button:last-of-type');

				if (usesLabel) {
					const parts = usesLabel.textContent.split('/');
					if (parts.length === 2) {
						const maxUses = parseInt(parts[1]);
						usesLabel.textContent = `0/${maxUses}`;
						if (decreaseBtn) decreaseBtn.disabled = true;
						if (increaseBtn) increaseBtn.disabled = false;
					}
				}
			});
		}
	});

	//short rest button
	const shortRestButton = overlayBody.querySelector('#shortRest');
	shortRestButton.addEventListener('click', function () {
		if (confirm("Take a short rest? This will allow you to spend Hit Dice and recover some features.")) {
			//warlocks get their spellslots back on a short rest.
			if (characterData.Classes[0]?.Definition?.Name === "Warlock") {
				if (characterData.Pact) {
					characterData.Pact.SlotsUsed = 0;
				}

				if (characterData.SpellSlots) {
					const warlockLevel = characterData.Classes[0].Level;
					const highestSpellLevel = findHighestWarlockSpellLevel(characterData);

					if (characterData.SpellSlots[highestSpellLevel - 1]) {
						characterData.SpellSlots[highestSpellLevel - 1].Used = 0;
					}
				}

				updateWarlockSpellSlotDisplay();
			}

			//class features that restore on a short rest.
			let featuresRestored = [];

			//check for any features with the LimitedUse key that recharges on a short rest
			if (characterData.Actions) {
				for (let i = 0; i < Object.keys(characterData.Actions).length; i++) {
					const action = characterData.Actions[i];
					if (action && action.LimitedUse &&
						(action.LimitedUse.ResetType === "ShortRest" || action.LimitedUse.ResetType === "Short Rest")) {
						action.LimitedUse.NumberUsed = 0;
						featuresRestored.push(action.Name);
					}
				}
			}

			// Check if sorcerer with Font of Inspiration
			const isBard = characterData.Classes[0]?.Definition?.Name === "Bard";
			const bardLevel = characterData.Classes[0]?.Level || 0;

			// Font of Inspiration - Bards regain Bardic Inspiration on short rest
			if (isBard && bardLevel >= 5) {
				for (const key in characterData.Actions) {
					if (characterData.Actions[key].Name &&
						characterData.Actions[key].Name.includes("Bardic Inspiration")) {
						characterData.Actions[key].LimitedUse.NumberUsed = 0;
						featuresRestored.push(characterData.Actions[key].Name);
						break;
					}
				}

				// Update UI for bardic inspiration
				const inspirationCounter = document.querySelector('#bard-container span');
				if (inspirationCounter) {
					const maxInspiration = Math.max(1, characterData.AbilityScores.Modifier.Charisma);
					inspirationCounter.textContent = `${maxInspiration}/${maxInspiration}`;
				}
			}

			// Update UI for any restored features that are currently displayed
			document.querySelectorAll('.usage-tracker').forEach(tracker => {
				const featureButton = tracker.closest('.feature-button');
				if (featureButton) {
					const nameButton = featureButton.querySelector('.styled-button');
					if (nameButton && featuresRestored.includes(nameButton.textContent)) {
						const usesLabel = tracker.querySelector('.uses-label');
						const decreaseBtn = tracker.querySelector('button:first-of-type');
						const increaseBtn = tracker.querySelector('button:last-of-type');

						if (usesLabel) {
							const parts = usesLabel.textContent.split('/');
							if (parts.length === 2) {
								const maxUses = parseInt(parts[1]);
								usesLabel.textContent = `0/${maxUses}`;
								if (decreaseBtn) decreaseBtn.disabled = true;
								if (increaseBtn) increaseBtn.disabled = false;
							}
						}
					}
				}
			});

			chrome.storage.local.set({ 'characterData': characterData });
		}
	});

	const strButton = overlayBody.querySelector('#strButton');
	strButton.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.AbilityScores.Modifier.Strength}`, event);
	});

	const dexButton = overlayBody.querySelector('#dexButton');
	dexButton.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.AbilityScores.Modifier.Dexterity}`, event);
	});

	const conButton = overlayBody.querySelector('#conButton');
	conButton.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.AbilityScores.Modifier.Constitution}`, event);
	});

	const intButton = overlayBody.querySelector('#intButton');
	intButton.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.AbilityScores.Modifier.Intellegence}`, event);
	});

	const wisButton = overlayBody.querySelector('#wisButton');
	wisButton.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.AbilityScores.Modifier.Wisdom}`, event);
	});

	const chaButton = overlayBody.querySelector('#chaButton');
	chaButton.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.AbilityScores.Modifier.Charisma}`, event);
	});

	//Menu Button
	const actionButton = overlayBody.querySelector('#actions');
	actionButton.addEventListener('click', function () {
		showActions(adventureData);
	});

	const bioButton = overlayBody.querySelector('#bio');
	bioButton.addEventListener('click', function () {
		showBio(adventureData);
	});

	const featuresButton = overlayBody.querySelector('#features');
	featuresButton.addEventListener('click', function () {
		showFeatures(adventureData);
	});

	const inventoryButton = overlayBody.querySelector('#inventory');
	inventoryButton.addEventListener('click', function () {
		showInventory(adventureData);
	});

	const spellsButton = overlayBody.querySelector('#spells');
	spellsButton.addEventListener('click', function () {
		showSpells(adventureData);
	});

	const extrasButton = overlayBody.querySelector("#extras");
	extrasButton.addEventListener('click', function () {
		showExtras(adventureData);
	});

	overlayContainer.appendChild(overlayHeader);
	overlayContainer.appendChild(overlayBody);
	document.body.appendChild(overlayContainer);


	const skillList = document.getElementById('skillList');
	for (const skillName in characterData.Skills) {
		const skill = characterData.Skills[skillName];

		//Radio button
		const skillElement = document.createElement('input');
		skillElement.type = "radio";
		skillElement.disabled = true;
		skillElement.style.marginTop = '5px';

		if (skill.isProficient) {
			skillElement.checked = true;
		} else {
			skillElement.checked = false;
		}

		//Label element
		const skillLabel = document.createElement('label');
		skillLabel.style.fontSize = "11px";
		skillLabel.textContent = skillName;

		//button element
		const skillModifier = document.createElement('button');
		skillModifier.id = "modifierButton";
		skillModifier.style.marginRight = "7px";
		skillModifier.style.fontSize = "14px";
		skillModifier.style.width = "25px";
		skillModifier.classList.add('skill-button-modification');
		skillModifier.title = "Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" 
		skillModifier.textContent = skill.totalModifier >= 0 ? `+${skill.totalModifier}` : skill.totalModifier;

		skillModifier.addEventListener('click', function (event) {
			roll_dice(`1d20+${skill.totalModifier}`, event);
		});

		const breakLine = document.createElement('br');

		skillList.appendChild(skillElement);
		skillList.appendChild(skillModifier);
		skillList.appendChild(skillLabel);
		skillList.appendChild(breakLine);
	}

	const savingThrowElement = document.getElementById('savingThrowElement');

	const savingThrowOrder = ["Strength", "Dexterity", "Constitution", "Intellegence", "Wisdom", "Charisma"];

	// Process saving throws in the defined order
	for (const savingThrowName of savingThrowOrder) {
		if (characterData.SavingThrows[savingThrowName]) {
			const savingThrow = characterData.SavingThrows[savingThrowName];

			const savingThrowRow = document.createElement('div');
			savingThrowRow.style.display = 'flex';
			savingThrowRow.style.alignItems = 'center';
			savingThrowRow.style.marginBottom = '5px';

			// radio button element
			const savingThrowRadio = document.createElement('input');
			savingThrowRadio.type = "radio";
			savingThrowRadio.disabled = true;
			savingThrowRadio.style.marginRight = '5px';

			savingThrowRadio.checked = savingThrow.isChecked || false;

			//modifier button
			const savingThrowModifier = document.createElement('button');
			savingThrowModifier.id = "modifierButton";
			savingThrowModifier.style.marginRight = "5px";
			savingThrowModifier.style.fontSize = "14px";
			savingThrowModifier.style.width = "25px";
			savingThrowModifier.classList.add('skill-button-modification');
            savingThrowModifier.title = "Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE";
			savingThrowModifier.textContent = savingThrow.total >= 0 ? `+${savingThrow.total}` : savingThrow.total;

			savingThrowModifier.addEventListener('click', function (event) {
				roll_dice(`1d20+${savingThrow.total}`, event);
			});

			// label element
			const savingThrowLabel = document.createElement('label');
			savingThrowLabel.style.fontSize = "11px";
			savingThrowLabel.textContent = savingThrowName;

			savingThrowRow.appendChild(savingThrowRadio);
			savingThrowRow.appendChild(savingThrowModifier);
			savingThrowRow.appendChild(savingThrowLabel);

			savingThrowElement.appendChild(savingThrowRow);
		}
	}

	const speedSection = overlayBody.querySelector('.speed-section');
	const speedInput = speedSection.querySelector('#speed');

	let speeds = {};

	speeds["Walking"] = characterData.Race.Speed || 30;

	if (characterData.customSpeeds && Array.isArray(characterData.customSpeeds)) {
		characterData.customSpeeds.forEach(customSpeed => {
			switch (customSpeed.movementId) {
				case 1: speeds["Walking"] = customSpeed.distance; break;
				case 2: speeds["Burrowing"] = customSpeed.distance; break;
				case 3: speeds["Climbing"] = customSpeed.distance; break;
				case 4: speeds["Flying"] = customSpeed.distance; break;
				case 5: speeds["Swimming"] = customSpeed.distance; break;
			}
		});
	} else {
		if (characterData.Race.BurrowSpeed) speeds["Burrowing"] = characterData.Race.BurrowSpeed;
		if (characterData.Race.ClimbingSpeed) speeds["Climbing"] = characterData.Race.ClimbingSpeed;
		if (characterData.Race.FlySpeed) speeds["Flying"] = characterData.Race.FlySpeed;
		if (characterData.Race.SwimSpeed) speeds["Swimming"] = characterData.Race.SwimSpeed;
	}

	const nonWalkingSpeeds = Object.entries(speeds).filter(([type, speed]) =>
		type !== "Walking" && speed > 0
	);

	if (nonWalkingSpeeds.length > 0) {
		const indicator = document.createElement('div');
		indicator.className = 'speed-indicator';
		indicator.title = 'Additional movement types available';
		speedSection.appendChild(indicator);

		const tooltip = document.createElement('div');
		tooltip.className = 'speed-tooltip';

		const walkingDiv = document.createElement('div');
		walkingDiv.className = 'speed-type';
		walkingDiv.innerHTML = `<span class="speed-type-name">Walking:</span><span>${speeds["Walking"]} ft.</span>`;
		tooltip.appendChild(walkingDiv);

		nonWalkingSpeeds.forEach(([type, speed]) => {
			const speedDiv = document.createElement('div');
			speedDiv.className = 'speed-type';
			speedDiv.innerHTML = `<span class="speed-type-name">${type}:</span><span>${speed} ft.</span>`;
			tooltip.appendChild(speedDiv);
		});

		speedSection.appendChild(tooltip);
	}

	//set the character sheet to open
	characterSheetOpen = true;
	setupHPMonitoring(adventureData);
}

//This functions keeps check on the character's HP and updated it in the character sheet if there's a change
function setupHPMonitoring(adventureData) {
	if (window._hpMonitorInterval) {
		clearInterval(window._hpMonitorInterval);
	}

	// Find character
	let characterToMonitor = null;
	if (adventureData.characters) {
		const characters = Array.isArray(adventureData.characters.character)
			? adventureData.characters.character
			: [adventureData.characters.character];

		for (const character of characters) {
			if (character && character.name === characterData.Name) {
				characterToMonitor = character;
				break;
			}
		}
	}

	if (!characterToMonitor) {
		console.warn("Could not find character to monitor HP:", characterData.Name);
		return;
	}

	let lastKnownHP = {
		current: Number(characterToMonitor.hitpoints || 0) - Number(characterToMonitor.damage || 0),
		max: Number(characterToMonitor.hitpoints || 0)
	};

	// Checks every 500ms
	window._hpMonitorInterval = setInterval(() => {
		// Only update if the character sheet is open
		if (!characterSheetOpen) {
			clearInterval(window._hpMonitorInterval);
			window._hpMonitorInterval = null;
			return;
		}

		const urlWithJsonOutput = window.location.href + "?output=json";
		fetch(urlWithJsonOutput)
			.then(response => response.json())
			.then(freshData => {
				const adventure = freshData.adventure;

				// Find our character in fresh data using same approach
				let currentCharacter = null;
				if (adventure.characters) {
					const characters = Array.isArray(adventure.characters.character)
						? adventure.characters.character
						: [adventure.characters.character];

					for (const character of characters) {
						if (character && character.name === characterData.Name) {
							currentCharacter = character;
							break;
						}
					}
				}

				if (!currentCharacter) {
					return;
				}

				const currentHP = (Number(currentCharacter.hitpoints || 0) -
					Number(currentCharacter.damage || 0));
				const maxHP = Number(currentCharacter.hitpoints || 0);

				const currentHPInput = document.querySelector('.current-hp-input');
				const maxHPInput = document.querySelector('.max-hp-input');

				// Check if HP has changed from last known value
				if (currentHP !== lastKnownHP.current) {
					// Update the UI
					if (currentHPInput) {
						currentHPInput.value = currentHP;
					}

					// Update last known HP
					lastKnownHP.current = currentHP;
					lastKnownHP.max = maxHP;
				}

				if (maxHPInput && maxHPInput.value !== String(maxHP)) {
					maxHPInput.value = maxHP;
				}
			})
			.catch(error => {
				console.error("Error checking for HP updates:", error);
			});
	}, 500);
}

function showBio(adventureData) {
	const characterSheetOverlay = document.getElementById('customOverlay');
	characterSheetOverlay.style.width = "500px";

	const content = document.getElementById('overlayContainer');
	content.innerHTML = '';

	let characterHidden = "";

	// Get character's hidden status from adventure data
	if (adventureData.characters.character.length != null) {
		for (let i = 0; i < adventureData.characters.character.length; i++) {
			if (adventureData.characters.character[i].name === characterData.Name) {
				if (adventureData.characters.character[i].hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}
	} else {
		if (adventureData.characters.character.hidden === "yes") {
			characterHidden = "[hidden]";
		}
	}

	// Update header with Bio section title
	const header = document.getElementById('titleBar');
	header.innerHTML = `${characterData.Name} - Bio ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	// Add close button functionality
	const closeButton = header.querySelector('.close');
	closeButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
	});

	// Create main bio content
	content.innerHTML = `
            <div id="overlayContainer">
            <div class="Character-menu-container" style="position: absolute; margin-top: 23px; right: 0;">
				<div class="character-menu menu-panel" style="border: 2px solid #336699; padding: 5px; height: 230px;">
						<button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="width: 100px; margin-top: 5px;">Actions</button>
						<button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Bio</button>
						<button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Character</button>
						<button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Features</button>
						<button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Inventory</button>
						<button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Spells</button>
						<button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
				</div>
			</div>

			<div id="bioDiv" style="height: 495px; width: 350px; margin-left: 0px; margin-top: 0px; overflow: auto;overflow: auto; border: 2px solid #336699; padding: 10px;">
                <ul id="ContentList" style="padding: 0; list-style-type: none;">
                    <!-- Character Bio Sections -->
                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Backstory</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.Backstory || ""}</label>
                        </div>
                    </div>
                    <hr>
                    
                    <!-- Appearance Section with Grid Layout -->
                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="appearance button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Appearance</b></button>
                        <div style="margin-left: 20px;">
                            <div style="display: grid; grid-template-columns: auto 1fr; gap: 12px; font-size: 13px; background-color: #f8f9fa; padding: 15px; border-radius: 4px;">
                                <label><b>Age:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Age || "Unknown"}</label>
                                
                                <label><b>Eyes:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Eyes || "Unknown"}</label>
                                
                                <label><b>Faith:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Faith || "Unknown"}</label>
                                
                                <label><b>Gender:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Gender || "Unknown"}</label>
                                
                                <label><b>Hair:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Hair || "Unknown"}</label>
                                
                                <label><b>Height:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Height || "Unknown"}</label>
                                
                                <label><b>Skin:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Skin || "Unknown"}</label>
                                
                                <label><b>Weight:</b></label>
                                <label style="white-space: pre-wrap;">${characterData.Weight || "Unknown"}</label>
                            </div>
                        </div>
                    </div>
                    <hr>

                    <!-- Additional Character Info Sections -->
                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Allies</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.Allies || ""}</label>
                        </div>
                    </div>
                    <hr>

                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Enemies</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.Enemies || ""}</label>
                        </div>
                    </div>
                    <hr>
                    
                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Organizations</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.Organizations || ""}</label>
                        </div>
                    </div>
                    <hr>
                    
                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Other Holdings</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.OtherHoldings || ""}</label>
                        </div>
                    </div>
                    <hr>

                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Other Notes</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.OtherNotes || ""}</label>
                        </div>
                    </div>
                    <hr>
                    
                    <div class="bio-section" style="margin-bottom: 20px;">
                        <button id="bioButton" class="backstory button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Personal Possessions</b></button>
                        <div style="margin-left: 20px;">
                            <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Notes.PersonalPossessions || ""}</label>
                        </div>
                    </div>
                    <hr>

                    <!-- Background Section -->
                    <div class="bio-section" style="margin-top: 30px; margin-bottom: 20px;">
                        <h3 class="background-header" style="font-size: 22px; color: #336699; margin-bottom: 15px;">Background: ${characterData.Background.Name}</h3>
                        
                        <div class="bio-subsection" style="margin-bottom: 20px;">
                            <button id="bioButton" class="personality button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Background Description</b></button>
                            <div style="margin-left: 20px;">
                                <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Background.Description || ""}</label>
                            </div>
                        </div>
                        <hr>

                        <div class="bio-subsection" style="margin-bottom: 20px;">
                            <button id="bioButton" class="personality button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Features: ${characterData.Background.Feature.Name}</b></button>
                            <div style="margin-left: 20px;">
                                <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Background.Feature.Description || ""}</label>
                            </div>
                        </div>
                        <hr>
                        
                        <div class="bio-subsection" style="margin-bottom: 20px;">
                            <button id="bioButton" class="personality button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Personality Traits</b></button>
                            <div style="margin-left: 20px;">
                                <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Background.Traits.personalityTraits || ""}</label>
                            </div>
                        </div>
                        <hr>
                        
                        <div class="bio-subsection" style="margin-bottom: 20px;">
                            <button id="bioButton" class="ideals button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Ideals</b></button>
                            <div style="margin-left: 20px;">
                                <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Background.Traits.ideals || ""}</label>
                            </div>
                        </div>
                        <hr>
                        
                        <div class="bio-subsection" style="margin-bottom: 20px;">
                            <button id="bioButton" class="bonds button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Bonds</b></button>
                            <div style="margin-left: 20px;">
                                <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Background.Traits.bonds || ""}</label>
                            </div>
                        </div>
                        <hr>
                        
                        <div class="bio-subsection" style="margin-bottom: 20px;">
                            <button id="bioButton" class="flaws button-modification" style="font-size: 20px; width: 100%; text-align: left; margin-bottom: 10px;"><b>Flaws</b></button>
                            <div style="margin-left: 20px;">
                                <label style="font-size: 13px; white-space: pre-wrap;">${characterData.Background.Traits.flaws || ""}</label>
                            </div>
                        </div>
                    </div>
                </ul>
            </div>
        </div>
    `;

	// Add menu button event listeners
	const actionButton = content.querySelector('#actions');
	actionButton.addEventListener('click', () => showActions(adventureData));

	const characterButton = content.querySelector('#character');
	characterButton.addEventListener('click', function () {
		// Remove the current overlay and create a new one
		characterSheetOverlay.remove();
		characterSheetOpen = false;
		// Call the createCharacterSheet function again to rebuild the character sheet
		createCharacterSheet(adventureData);
	});

	const featuresButton = content.querySelector('#features');
	featuresButton.addEventListener('click', () => showFeatures(adventureData));

	const inventoryButton = content.querySelector('#inventory');
	inventoryButton.addEventListener('click', () => showInventory(adventureData));

	const spellsButton = content.querySelector('#spells');
	spellsButton.addEventListener('click', () => showSpells(adventureData));

	const extrasButton = content.querySelector("#extras");
	extrasButton.addEventListener('click', function () {
		showExtras(adventureData);
	});

	//Get all the buttons
	const bioButtons = content.querySelectorAll('.bio-section button, .bio-subsection button');
	bioButtons.forEach(button => {
		button.addEventListener('click', function () {
			const contentDiv = this.nextElementSibling;
			const sectionLabel = contentDiv.querySelector('label');
			const sectionName = "[b]" + this.textContent + "[/b]";
			const sectionContent = sectionLabel.textContent;

			const message = `${sectionName}\n_____________\n${sectionContent}`;

			if (sectionContent.trim()) {
				sendDataToSidebar(message, characterData.Name);
			}
		});
	});
}

function showActions(adventureData) {
	const characterSheetOverlay = document.getElementById('customOverlay');
	characterSheetOverlay.style.width = "500px";

	const content = document.getElementById('overlayContainer');
	content.innerHTML = '';

	let characterHidden = "";

	// Get character's hidden status from adventure data
	if (adventureData.characters.character.length != null) {
		for (let i = 0; i < adventureData.characters.character.length; i++) {
			if (adventureData.characters.character[i].name === characterData.Name) {
				if (adventureData.characters.character[i].hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}
	} else {
		if (adventureData.characters.character.hidden === "yes") {
			characterHidden = "[hidden]";
		}
	}

	// Update header with Actions section title
	const header = document.getElementById('titleBar');
	header.innerHTML = `${characterData.Name} - Actions ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	// Add close button functionality
	const closeButton = header.querySelector('.close');
	closeButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
	});

	content.innerHTML = `
    <div id="overlayContainer">
        <div style="display: flex;">
            <div>
                <div id="actionsList" style="height: 495px; width: 350px; margin-left: 0px; margin-top: 0px; overflow: auto; border: 2px solid #336699; padding: 10px;">
                    <ul id="ContentList">
                        <p style="font-size: 20px;"><b>Actions</b></p>
                        <div>
                            <ul id="actionList">
                                <div id="allActions">
                                    <p><b>Actions In Combat</b></p>
                                    <p style="max-width: 400px; font-size: 12px;">Attack, Cast a Spell, Dash, Disengage, Dodge, Grapple, Help, Hide, Improvise, Ready, Search, Shove, Use an Object</p>
                                    <button id="unarmedStrike" title="An unarmed, no weapon strike." class="styled-button" style="color: #6385C1;"><b>Unarmed Strike</b></button>
                                    <label id="actionReach" style="font-size: 14px;">reach: 5ft.</label>
                                    <button id="unarmedStrikeAttackRoll" title="Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE" class="skill-button-modification" style="color: #6385C1;">+${characterData.ProficiencyBonus + Math.floor((characterData.AbilityScores.Modifier.Strength))}</button>
                                    <button id="unarmedStrikeDamage" title="Unarmed Damage" class="skill-button-modification" style="color: #6385C1;">1+${characterData.AbilityScores.Modifier.Strength}</button>
                                    <hr>
                                </div>
                            </ul>
                        </div>
                        <div>
                            <p style="font-size: 20px;"><b>Character Actions</b></p>
                            <div id="characterActions">
                            </div>
                        </div>
                        <div>
                            <p style="font-size: 20px;"><b>Bonus Actions</b></p>
                            <div id="allBonusActions">
                            </div>
                        </div>
                        <div>
                            <p style="font-size: 20px;"><b>Reactions</b></p>
                            <div id="allReactions">
                            </div>
                        </div>
                    </ul>
                </div>
            </div>
            <div class="Character-menu-container" style="position: absolute; margin-top: 23px; right: 0;">
                <div class="character-menu menu-panel" style="border: 2px solid #336699; padding: 5px; height: 230px;">
                    <button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="width: 100px; margin-top: 5px;">Actions</button>
                    <button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Bio</button>
                    <button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Character</button>
                    <button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Features</button>
                    <button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Inventory</button>
                    <button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Spells</button>
					<button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
                </div>
            </div>
            <div id="ammoList" style="border: 2px solid #336699; padding 8px; height: 260px; width: 120px; margin-left: 3px; margin-top: 235px; overflow-y: auto;"></div>
        </div>
    </div>
    `;

	if (document.querySelector('#allBonusActions').childNodes.length < 2) {
		const bonusActionsDiv = content.querySelector('#allBonusActions');
		const bonusActionsLabel = document.createElement('p');
		bonusActionsLabel.textContent = "No Bonus Actions Available";
		bonusActionsDiv.appendChild(bonusActionsLabel);
	}

	if (document.querySelector('#allReactions').childNodes.length < 2) {
		const bonusActionsDiv = content.querySelector('#allReactions');
		const bonusActionsLabel = document.createElement('p');
		bonusActionsLabel.textContent = "No Reactions Available";
		bonusActionsDiv.appendChild(bonusActionsLabel);
	}

	// Add weapons from inventory to actions list
	const allActionsDiv = content.querySelector('#allActions');
	for (let i = 0; i < Object.keys(characterData.Inventory).length; i++) {
		if (!characterData.Inventory[i] || !characterData.Inventory[i].Definition) {
			continue;
		}

		if (characterData.Inventory[i] && characterData.Inventory[i].Definition) {
			if (characterData.Inventory[i].Definition.FilterType === "Weapon" ||
				characterData.Inventory[i].Definition.FilterType === "Rod" ||
				characterData.Inventory[i].Definition.FilterType === "Staff") {

				const itemName = characterData.Inventory[i].Definition.Name;
				const range = characterData.Inventory[i].Definition.Range || 5;
				const longRange = characterData.Inventory[i].Definition.LongRange || 5;
				const attackRoll = characterData.Inventory[i].Definition.AttackRoll;
				const damageRoll = characterData.Inventory[i].Definition.DamageRoll;
				const description = characterData.Inventory[i].Definition.Description || "";

				// Create weapon button
				const weaponButton = document.createElement('button');
				weaponButton.id = "weapon";
				weaponButton.style.color = "#6385C1";
				weaponButton.style.fontWeight = 'bold';
				weaponButton.classList.add('styled-button');
				weaponButton.style.setProperty("padding-left", "4px", "important");
				weaponButton.style.setProperty("padding-right", "4px", "important");
				weaponButton.textContent = itemName;

				// Range label
				const reachLabel = document.createElement('label');
				reachLabel.style.fontSize = "14px";
				reachLabel.style.padding = "0 5px"; // Adding horizontal padding
				reachLabel.textContent = `Range: ${range}/${longRange}ft.`;

				// Attack roll button
				const weaponAttackButton = document.createElement('button');
				weaponAttackButton.id = "weapon";
				weaponAttackButton.style.color = "#6385C1";
				weaponAttackButton.title = "Ctrl + Click: ADVANTAGE - Shift + Click: DISADVANTAGE";
				weaponAttackButton.textContent = attackRoll.replace('1d20+', '+');
				weaponAttackButton.classList.add('skill-button-modification');
				weaponAttackButton.style.marginRight = "8px";

				// Damage button
				const damageButton = document.createElement('button');
				damageButton.id = "weapon";
				damageButton.style.color = "#6385C1";
				damageButton.textContent = damageRoll;
				damageButton.title = itemName + " Damage";
				damageButton.classList.add('skill-button-modification');

				const descriptionText = createProcessedDescription(description);

				const breakLine = document.createElement('hr');

				// Add elements to the actions div
				allActionsDiv.appendChild(weaponButton);
				allActionsDiv.appendChild(reachLabel);
				allActionsDiv.appendChild(weaponAttackButton);
				allActionsDiv.appendChild(damageButton);
				if (description) {
					allActionsDiv.appendChild(descriptionText);
				}
				allActionsDiv.appendChild(breakLine);

				// Add event listeners
				weaponButton.addEventListener('click', function () {
					const message = `${itemName}\nRange: ${range}/${longRange}ft.\n${description}`;
					sendDataToSidebar(message, characterData.Name);
				});

				weaponAttackButton.addEventListener('click', function (event) {
					//attack roll and reduces ammunition by 1 every attack roll made
					roll_dice(attackRoll, event);

					const weaponAmmoMap = {
						'crossbow': ['bolt', 'crossbow bolt'],
						'longbow': ['arrow', 'arrows'],
						'shortbow': ['arrow', 'arrows'],
						'sling': ['bullet', 'sling bullet', 'sling bullets'],
						'blowgun': ['needle', 'blowgun needle', 'blowgun needles']
					};

					const weaponName = weaponButton.textContent.toLowerCase();
					let ammoType = null;

					for (const [weaponType, ammoOptions] of Object.entries(weaponAmmoMap)) {
						if (weaponName.includes(weaponType)) {
							ammoType = ammoOptions;
							break;
						}
					}

					// In the weapon attack button click handler
					if (ammoType) {
						for (let j = 0; j < Object.keys(characterData.Inventory).length; j++) {
							const itemName = characterData.Inventory[j].Definition?.Name?.toLowerCase() || '';

							const isMatchingAmmo = ammoType.some(type => itemName.includes(type));

							if (isMatchingAmmo && characterData.Inventory[j].Quantity > 0) {
								characterData.Inventory[j].Quantity = Number(characterData.Inventory[j].Quantity) - 1;

								// Save to both data structures for persistence
								chrome.storage.local.set({ 'characterData': characterData });

								// Also update in the characters collection
								chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
									if (result.activeCharacterId && result.characters &&
										result.characters[result.activeCharacterId]) {
										result.characters[result.activeCharacterId].Inventory[j].Quantity =
											characterData.Inventory[j].Quantity;

										chrome.storage.local.set({ 'characters': result.characters });
									}
								});

								// Update the UI
								const ammoDiv = document.getElementById('ammoList');
								if (ammoDiv) {
									// Find the ammo container that matches the item name
									const ammoContainers = ammoDiv.querySelectorAll('[data-inventory-index]');

									for (const ammoLabel of ammoContainers) {
										const inventoryIndex = ammoLabel.getAttribute('data-inventory-index');
										if (parseInt(inventoryIndex) === j) {
											ammoLabel.textContent = characterData.Inventory[j].Quantity;
											break;
										}
									}
								}

								break;
							}
						}
					}

				});

				damageButton.addEventListener('click', function () {
					roll_dice(damageRoll);
				});
			}
		}
	}

	// Add character actions from the data
	const characterActionsDiv = content.querySelector('#characterActions');
	for (let i = 0; i < Object.keys(characterData.Actions).length; i++) {
		const action = characterData.Actions[i];

		// Create action button
		const actionButton = document.createElement('button');
		actionButton.id = "actionName";
		actionButton.style.color = "#6385C1";
		actionButton.style.fontWeight = "bold";
		actionButton.textContent = action.Name;
		actionButton.title = action.Description || "No description available";
		actionButton.classList.add('styled-button');

		// Create description
		const actionDescription = createProcessedDescription(action.Description);

		const breakLine = document.createElement('hr');

		// Add elements to the actions div
		characterActionsDiv.appendChild(actionButton);
		if (action.Description) {
			characterActionsDiv.appendChild(actionDescription);
		}
		characterActionsDiv.appendChild(breakLine);

		// Add event listeners
		actionButton.addEventListener('click', function () {
			const message = `${action.Name}\n_______________\n${action.Description || "No description available"}`;
			sendDataToSidebar(message, characterData.Name);
		});
	}

	// Set up unarmed strike action
	const unarmedStrikeButton = content.querySelector('#unarmedStrike');
	const unarmedStrikeMod = content.querySelector('#unarmedStrikeAttackRoll');
	const unarmedStrikeDamage = content.querySelector('#unarmedStrikeDamage');

	unarmedStrikeButton.addEventListener('click', function () {
		const message = `Unarmed Strike\n_________________\nMake a melee attack against a creature within 5 feet of you.`;
		sendDataToSidebar(message, characterData.Name);
	});

	unarmedStrikeMod.addEventListener('click', function (event) {
		roll_dice(`1d20+${characterData.ProficiencyBonus + Math.floor(characterData.AbilityScores.Modifier.Strength)}`, event);
	});

	unarmedStrikeDamage.addEventListener('click', function () {
		sendDataToSidebar(`[b]Unarmed strike Damage[/b]: 1+${characterData.AbilityScores.Modifier.Strength} = ${Number(characterData.AbilityScores.Modifier.Strength) + 1}`, characterData.Name);
	});

	// Add menu button event listeners
	const bioButton = content.querySelector('#bio');
	bioButton.addEventListener('click', function () {
		showBio(adventureData);
	});

	const characterButton = content.querySelector('#character');
	characterButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
		createCharacterSheet(adventureData);
	});

	const featuresButton = content.querySelector('#features');
	featuresButton.addEventListener('click', function () {
		showFeatures(adventureData);
	});

	const inventoryButton = content.querySelector('#inventory');
	inventoryButton.addEventListener('click', function () {
		showInventory(adventureData);
	});

	const spellsButton = content.querySelector('#spells');
	spellsButton.addEventListener('click', function () {
		showSpells(adventureData);
	});

	const extrasButton = content.querySelector("#extras");
	extrasButton.addEventListener('click', function () {
		showExtras(adventureData);
	});

	// Create ammo list display
	const ammoDiv = content.querySelector('#ammoList');
	const ammoList = ["Crossbow Bolts", "Arrows", "Sling Bullets", "Blowgun Needles", "Ammuniton", "Bullets"];

	// Add a header to the ammo section
	const ammoHeader = document.createElement('div');
	ammoHeader.textContent = "Ammunition";
	ammoHeader.style.fontWeight = "bold";
	ammoHeader.style.textAlign = "center";
	ammoHeader.style.marginBottom = "5px";
	ammoDiv.appendChild(ammoHeader);

	for (let i = 0; i < Object.keys(characterData.Inventory).length; i++) {
		const item = characterData.Inventory[i];  // Add this line to define the item variable
		if (!item || !item.Definition) {
			console.warn(`Skipping undefined inventory item at index ${i}`);
			continue;
		}

		// Check if any string from ammoList is contained within the inventory item name
		const itemName = characterData.Inventory[i].Definition.Name;
		const isAmmo = ammoList.some(ammoType => itemName.includes(ammoType));

		if (isAmmo) {
			const ammoItemContainer = document.createElement('div');
			ammoItemContainer.style.textAlign = 'center';
			ammoItemContainer.style.marginBottom = "8px";

			// Name label
			const nameLabel = document.createElement('label');
			nameLabel.textContent = itemName;
			nameLabel.style.fontSize = "14px";
			nameLabel.style.display = "block";

			// Control container for +/- buttons and amount
			const controlContainer = document.createElement('div');
			controlContainer.style.display = "flex";
			controlContainer.style.alignItems = "center";
			controlContainer.style.justifyContent = "center";
			controlContainer.style.marginTop = "3px";

			// Minus button
			const minusButton = document.createElement('button');
			minusButton.innerHTML = "−";
			minusButton.className = "btn btn-default btn-xs";
			minusButton.style.padding = "0px 5px";
			minusButton.title = "Decrease ammunition";

			// Amount label
			const ammoAmountLabel = document.createElement('label');
			ammoAmountLabel.textContent = characterData.Inventory[i].Quantity;
			ammoAmountLabel.style.fontSize = "14px";
			ammoAmountLabel.style.fontWeight = "bold";
			ammoAmountLabel.style.margin = "0 8px";
			ammoAmountLabel.style.color = "#0056b3";
			ammoAmountLabel.setAttribute('data-inventory-index', i);

			// Plus button
			const plusButton = document.createElement('button');
			plusButton.innerHTML = "+";
			plusButton.className = "btn btn-default btn-xs";
			plusButton.style.padding = "0px 5px";
			plusButton.title = "Add ammunition";

			// Add event listeners to buttons
			// Add event listeners to buttons
			minusButton.addEventListener('click', function () {
				const inventoryIndex = ammoAmountLabel.getAttribute('data-inventory-index');
				if (characterData.Inventory[inventoryIndex].Quantity > 0) {
					characterData.Inventory[inventoryIndex].Quantity--;
					ammoAmountLabel.textContent = characterData.Inventory[inventoryIndex].Quantity;

					// Save to storage - both formats
					chrome.storage.local.set({ 'characterData': characterData });

					// Also update in the characters collection for persistence
					chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
						if (result.activeCharacterId && result.characters &&
							result.characters[result.activeCharacterId]) {
							result.characters[result.activeCharacterId].Inventory[inventoryIndex].Quantity =
								characterData.Inventory[inventoryIndex].Quantity;

							chrome.storage.local.set({ 'characters': result.characters });
						}
					});
				}
			});

			plusButton.addEventListener('click', function () {
				const inventoryIndex = ammoAmountLabel.getAttribute('data-inventory-index');
				characterData.Inventory[inventoryIndex].Quantity++;
				ammoAmountLabel.textContent = characterData.Inventory[inventoryIndex].Quantity;

				// Save to storage - both formats
				chrome.storage.local.set({ 'characterData': characterData });

				// Also update in the characters collection for persistence
				chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
					if (result.activeCharacterId && result.characters &&
						result.characters[result.activeCharacterId]) {
						result.characters[result.activeCharacterId].Inventory[inventoryIndex].Quantity =
							characterData.Inventory[inventoryIndex].Quantity;

						chrome.storage.local.set({ 'characters': result.characters });
					}
				});
			});

			// Assemble the control container
			controlContainer.appendChild(minusButton);
			controlContainer.appendChild(ammoAmountLabel);
			controlContainer.appendChild(plusButton);

			// Append children to container
			ammoItemContainer.appendChild(nameLabel);
			ammoItemContainer.appendChild(controlContainer);

			// Append container to ammoDiv
			ammoDiv.appendChild(ammoItemContainer);

			// Add a separator between items
			const breakLine = document.createElement('hr');
			breakLine.style.marginTop = "5px";
			breakLine.style.marginBottom = "5px";
			ammoDiv.appendChild(breakLine);
		}
	}

	// Add a note about ammunition management
	if (ammoDiv.childElementCount > 1) {  // If we added any ammo items
		const ammoNote = document.createElement('p');
		ammoNote.textContent = "Use + and − buttons to adjust ammunition quantities.";
		ammoNote.style.fontSize = "10px";
		ammoNote.style.fontStyle = "italic";
		ammoNote.style.textAlign = "center";
		ammoNote.style.marginTop = "5px";
		ammoDiv.appendChild(ammoNote);
	} else {
		// No ammo found
		const noAmmoMsg = document.createElement('p');
		noAmmoMsg.textContent = "No ammunition found in inventory.";
		noAmmoMsg.style.fontStyle = "italic";
		noAmmoMsg.style.fontSize = "12px";
		noAmmoMsg.style.textAlign = "center";
		ammoDiv.appendChild(noAmmoMsg);
	}


	setupDiceRollHandlers();
}

function showFeatures(adventureData) {
	const characterSheetOverlay = document.getElementById('customOverlay');
	characterSheetOverlay.style.width = "500px";

	const content = document.getElementById('overlayContainer');
	content.innerHTML = '';

	let characterHidden = "";

	if (adventureData.characters.character.length != null) {
		for (let i = 0; i < adventureData.characters.character.length; i++) {
			if (adventureData.characters.character[i].name === characterData.Name) {
				if (adventureData.characters.character[i].hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}
	} else {
		if (adventureData.characters.character.hidden === "yes") {
			characterHidden = "[hidden]";
		}
	}

	const header = document.getElementById('titleBar');
	header.innerHTML = `${characterData.Name} - Features ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	const closeButton = header.querySelector('.close');
	closeButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
	});

	content.innerHTML = `
        <div id="overlayContainer">
            <div class="Character-menu-container" style="position: absolute; margin-top: 23px; right: 0;">
                <div class="character-menu menu-panel" style="border: 2px solid #336699; padding: 5px; height: 230px;">
                    <button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="width: 100px; margin-top: 5px;">Actions</button>
                    <button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Bio</button>
                    <button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Character</button>
                    <button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Features</button>
                    <button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Inventory</button>
                    <button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Spells</button>
					<button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
                </div>
            </div>
            <div style="height: 495px; width: 350px; margin-left: 0px; margin-top: 0px; overflow: auto; border: 2px solid #336699; padding: 10px;">
                <h4 style="margin-top: 0;"><b>Class Features</b></h4>
                <div id="classFeatures"></div>
                
                <h4 style="margin-top: 20px;"><b>Character Actions & Abilities</b></h4>
                <div id="characterFeatures"></div>
                
                <h4 style="margin-top: 20px;"><b>Racial Features</b></h4>
                <div id="racialFeatures"></div>
                
                <h4 style="margin-top: 20px;"><b>Feat Features</b></h4>
                <div id="featFeatures"></div>
            </div>
        </div>
    `;

	//search bar feature
	const featuresDiv = content.querySelector('div[style*="height: 495px"]');
	const searchBar = addSearchBar(featuresDiv, '.feature-button .styled-button', (items, searchTerm) => {
		items.forEach(item => {
			const featureItem = item.closest('.feature-item');
			if (!featureItem) return;

			const titleText = item.textContent.toLowerCase();

			const description = featureItem.querySelector('.feature-description');
			const descriptionText = description ? description.textContent.toLowerCase() : '';

			const isMatch = titleText.includes(searchTerm) || descriptionText.includes(searchTerm);

			if (isMatch) {
				featureItem.style.display = '';
				if (description && descriptionText.includes(searchTerm) && !titleText.includes(searchTerm)) {
					description.style.display = 'block';
					const arrow = featureItem.querySelector('.arrow-icon');
					if (arrow) arrow.classList.add('arrow-down');
				}
			} else {
				featureItem.style.display = 'none';
			}
		});

		featuresDiv.querySelectorAll('h4').forEach(header => {
			const sectionId = header.nextElementSibling.id;
			const section = document.getElementById(sectionId);

			if (section) {
				const hasVisibleItems = Array.from(section.querySelectorAll('.feature-item'))
					.some(item => item.style.display !== 'none');

				header.style.display = hasVisibleItems || searchTerm === '' ? '' : 'none';
			}
		});
	});

	featuresDiv.insertBefore(searchBar, featuresDiv.firstChild);

	//Class Features
	const classFeatures = content.querySelector('#classFeatures');
	if (characterData.Classes && characterData.Classes["0"]) {
		const classInfo = characterData.Classes["0"];
		const subclassName = classInfo.SubClassDefinition ? classInfo.SubClassDefinition.Name : null;

		for (const featureKey in classInfo.Definition.ClassFeatures) {
			const feature = classInfo.Definition.ClassFeatures[featureKey];

			//Don't include ability score improvements since they don't include anything useful
			if (feature.Name.includes("Ability Score Improvement")) {
				continue;
			}

			//Container
			const featureContainer = document.createElement('div');
			featureContainer.classList.add('feature-item');

			//button container
			const featureButton = document.createElement('div');
			featureButton.classList.add('feature-button');
			featureButton.title = "Press to expand description";

			//feature button
			const titleButton = document.createElement('button');
			titleButton.classList.add('styled-button');
			titleButton.style.color = "#6385C1";
			titleButton.style.fontWeight = "bold";
			titleButton.style.minWidth = "auto";
			titleButton.style.padding = "4px 8px";
			titleButton.style.margin = "0";
			titleButton.textContent = feature.Name;

			//arrow - right
			const arrowSpan = document.createElement('span');
			arrowSpan.classList.add('arrow-icon');
			arrowSpan.innerHTML = '▶';

			featureButton.appendChild(titleButton);
			featureButton.appendChild(arrowSpan);

			const hasLimitedUse = checkForLimitedUse(feature.Name);

			// If the feature has limited uses, add a usage tracker
			if (hasLimitedUse) {
				const usageTracker = createUsageTracker(feature.Name, hasLimitedUse);
				featureButton.appendChild(titleButton);
				featureButton.appendChild(usageTracker);
				featureButton.appendChild(arrowSpan);
			} else {
				featureButton.appendChild(titleButton);
				featureButton.appendChild(arrowSpan);
			}

			//description container
			const featureDesc = document.createElement('div');
			featureDesc.classList.add('feature-description');

			//process description
			const descriptionText = feature.Description.replaceAll("� ", "• ");
			const processedDescriptionElement = createProcessedDescription(descriptionText);
			featureDesc.appendChild(processedDescriptionElement);

			titleButton.addEventListener('click', function (event) {
				event.stopPropagation();
				const message = `${feature.Name}\n_______________\n${descriptionText}`;
				sendDataToSidebar(message, characterData.Name);
			});

			featureButton.addEventListener('click', function (event) {
				if (event.target !== titleButton) {
					if (featureDesc.style.display === 'none' || featureDesc.style.display === '') {
						featureDesc.style.display = 'block';
						arrowSpan.classList.add('arrow-down');
					} else {
						featureDesc.style.display = 'none';
						arrowSpan.classList.remove('arrow-down');
					}
				}
			});

			featureContainer.appendChild(featureButton);
			featureContainer.appendChild(featureDesc);
			featureContainer.appendChild(document.createElement('hr'));

			classFeatures.appendChild(featureContainer);
		}

		//add any subclass features if there are any
		if (subclassName && classInfo.SubClassDefinition.ClassFeatures) {
			const subclassHeader = document.createElement('h5');
			subclassHeader.style.marginTop = '15px';
			subclassHeader.innerHTML = `<b>${subclassName} Features</b>`;
			classFeatures.appendChild(subclassHeader);

			for (const featureKey in classInfo.SubClassDefinition.ClassFeatures) {
				const feature = classInfo.SubClassDefinition.ClassFeatures[featureKey];

				//don't include ability score improvements
				if (feature.Name.includes("Ability Score Improvement")) {
					continue;
				}

				//feature container
				const featureContainer = document.createElement('div');
				featureContainer.classList.add('feature-item');

				//feature button container
				const featureButton = document.createElement('div');
				featureButton.classList.add('feature-button');
				featureButton.title = "Press to expand description";

				//title button
				const titleButton = document.createElement('button');
				titleButton.classList.add('styled-button');
				titleButton.style.color = "#6385C1";
				titleButton.style.fontWeight = "bold";
				titleButton.style.minWidth = "auto";
				titleButton.title = "Press to send to sidebar";
				titleButton.style.padding = "4px 8px";
				titleButton.style.margin = "0";
				titleButton.textContent = feature.Name;

				//arrow - right
				const arrowSpan = document.createElement('span');
				arrowSpan.classList.add('arrow-icon');
				arrowSpan.innerHTML = '▶';

				featureButton.appendChild(titleButton);
				featureButton.appendChild(arrowSpan);

				const hasLimitedUse = checkForLimitedUse(feature.Name);

				// If the feature has limited uses, add a usage tracker
				if (hasLimitedUse) {
					const usageTracker = createUsageTracker(feature.Name, hasLimitedUse);
					featureButton.appendChild(titleButton);
					featureButton.appendChild(usageTracker);
					featureButton.appendChild(arrowSpan);
				} else {
					featureButton.appendChild(titleButton);
					featureButton.appendChild(arrowSpan);
				}

				//feature description
				const featureDesc = document.createElement('div');
				featureDesc.classList.add('feature-description');

				//process decsription
				const descriptionText = feature.Description.replaceAll("� ", "• ") || "No description available";
				const processedDescriptionElement = createProcessedDescription(descriptionText);
				featureDesc.appendChild(processedDescriptionElement);

				titleButton.addEventListener('click', function (event) {
					event.stopPropagation();
					const message = `${feature.Name}\n_______________\n${descriptionText}`;
					sendDataToSidebar(message, characterData.Name);
				});

				featureButton.addEventListener('click', function (event) {
					if (event.target !== titleButton) {
						if (featureDesc.style.display === 'none' || featureDesc.style.display === '') {
							featureDesc.style.display = 'block';
							arrowSpan.classList.add('arrow-down');
						} else {
							featureDesc.style.display = 'none';
							arrowSpan.classList.remove('arrow-down');
						}
					}
				});

				featureContainer.appendChild(featureButton);
				featureContainer.appendChild(featureDesc);
				featureContainer.appendChild(document.createElement('hr'));

				classFeatures.appendChild(featureContainer);
			}
		}
	}

	//add any character's actions that are features rather than actual actions
	const characterFeatures = content.querySelector('#characterFeatures');
	if (characterData.Actions) {
		for (const actionKey in characterData.Actions) {
			const action = characterData.Actions[actionKey];

			//action container
			const actionContainer = document.createElement('div');
			actionContainer.classList.add('feature-item');

			//action button container
			const actionButton = document.createElement('div');
			actionButton.classList.add('feature-button');
			actionButton.title = "Press to expand description";

			//title button
			const titleButton = document.createElement('button');
			titleButton.classList.add('styled-button');
			titleButton.style.color = "#6385C1";
			titleButton.style.fontWeight = "bold";
			titleButton.style.minWidth = "auto";
			titleButton.title = "Press to send to sidebar";
			titleButton.style.padding = "4px 8px";
			titleButton.style.margin = "0";
			titleButton.textContent = action.Name;

			//arrow - right
			const arrowSpan = document.createElement('span');
			arrowSpan.classList.add('arrow-icon');
			arrowSpan.innerHTML = '▶';

			actionButton.appendChild(titleButton);
			actionButton.appendChild(arrowSpan);

			const hasLimitedUse = checkForLimitedUse(action.Name);

			// If the feature has limited uses, add a usage tracker
			if (hasLimitedUse) {
				const usageTracker = createUsageTracker(action.Name, hasLimitedUse);
				actionButton.appendChild(titleButton);
				actionButton.appendChild(usageTracker);
				actionButton.appendChild(arrowSpan);
			} else {
				actionButton.appendChild(titleButton);
				actionButton.appendChild(arrowSpan);
			}

			//description container
			const actionDesc = document.createElement('div');
			actionDesc.classList.add('feature-description');

			//process description
			const descriptionText = action.Description.replaceAll("� ", "• ") || "No description available";
			const processedDescriptionElement = createProcessedDescription(descriptionText);
			actionDesc.appendChild(processedDescriptionElement);

			titleButton.addEventListener('click', function (event) {
				event.stopPropagation();
				const message = `${action.Name}\n_______________\n${descriptionText}`;
				sendDataToSidebar(message, characterData.Name);
			});

			actionButton.addEventListener('click', function (event) {
				if (event.target !== titleButton) {
					if (actionDesc.style.display === 'none' || actionDesc.style.display === '') {
						actionDesc.style.display = 'block';
						arrowSpan.classList.add('arrow-down');
					} else {
						actionDesc.style.display = 'none';
						arrowSpan.classList.remove('arrow-down');
					}
				}
			});

			actionContainer.appendChild(actionButton);
			actionContainer.appendChild(actionDesc);
			actionContainer.appendChild(document.createElement('hr'));

			characterFeatures.appendChild(actionContainer);
		}
	}

	//race and race features
	const racialFeatures = content.querySelector('#racialFeatures');
	if (characterData.Race) {
		//race container
		const raceContainer = document.createElement('div');
		raceContainer.classList.add('feature-item');

		//race button container
		const raceButton = document.createElement('div');
		raceButton.classList.add('feature-button');
		raceButton.title = "Press to expand description";

		//title button
		const titleButton = document.createElement('button');
		titleButton.classList.add('styled-button');
		titleButton.style.color = "#6385C1";
		titleButton.style.fontWeight = "bold";
		titleButton.style.minWidth = "auto";
		titleButton.title = "Press to send to sidebar";
		titleButton.style.padding = "4px 8px";
		titleButton.style.margin = "0";
		titleButton.textContent = characterData.Race.Name;

		//arrow - right
		const arrowSpan = document.createElement('span');
		arrowSpan.classList.add('arrow-icon');
		arrowSpan.innerHTML = '▶';

		raceButton.appendChild(titleButton);
		raceButton.appendChild(arrowSpan);

		const hasLimitedUse = checkForLimitedUse(characterData.Race.Name);

		// If the feature has limited uses, add a usage tracker
		if (hasLimitedUse) {
			const usageTracker = createUsageTracker(characterData.Race.Name, hasLimitedUse);
			raceButton.appendChild(titleButton);
			raceButton.appendChild(usageTracker);
			raceButton.appendChild(arrowSpan);
		} else {
			raceButton.appendChild(titleButton);
			raceButton.appendChild(arrowSpan);
		}

		//description
		const raceDesc = document.createElement('div');
		raceDesc.classList.add('feature-description');

		//process description
		let descriptionText = characterData.Race.Description.replaceAll("� ", "• ") || "No description available";
		const processedRaceDescription = createProcessedDescription(descriptionText);
		raceDesc.appendChild(processedRaceDescription);

		//race details
		const raceDetails = document.createElement('div');
		raceDetails.style.marginTop = '10px';
		raceDetails.innerHTML = [
			characterData.Race.Size ? `<div><strong>Size:</strong> ${characterData.Race.Size}</div>` : null,
			characterData.Race.Speed ? `<div><strong>Speed:</strong> ${characterData.Race.Speed} ft.</div>` : null,
			characterData.Race.FlySpeed ? `<div><strong>Fly Speed:</strong> ${characterData.Race.FlySpeed} ft.</div>` : null,
			characterData.Race.SwimSpeed ? `<div><strong>Swim Speed:</strong> ${characterData.Race.SwimSpeed} ft.</div>` : null,
			characterData.Race.ClimbingSpeed ? `<div><strong>Climb Speed:</strong> ${characterData.Race.ClimbingSpeed} ft.</div>` : null,
			characterData.Race.BurrowSpeed ? `<div><strong>Burrow Speed:</strong> ${characterData.Race.BurrowSpeed} ft.</div>` : null,
			(characterData.Race.UsingSubRace && characterData.Race.SubraceName) ? `<div><strong>Subrace:</strong> ${characterData.Race.SubraceName}</div>` : null
		].filter(Boolean).join('');
		raceDesc.appendChild(raceDetails);

		titleButton.addEventListener('click', function (event) {
			event.stopPropagation();
			const message = `${characterData.Race.Name}\n_______________\n${descriptionText}`;
			sendDataToSidebar(message, characterData.Name);
		});

		raceButton.addEventListener('click', function (event) {
			if (event.target !== titleButton) {
				if (raceDesc.style.display === 'none' || raceDesc.style.display === '') {
					raceDesc.style.display = 'block';
					arrowSpan.classList.add('arrow-down');
				} else {
					raceDesc.style.display = 'none';
					arrowSpan.classList.remove('arrow-down');
				}
			}
		});

		raceContainer.appendChild(raceButton);
		raceContainer.appendChild(raceDesc);
		raceContainer.appendChild(document.createElement('hr'));

		racialFeatures.appendChild(raceContainer);

		//add the race's traits if they exist
		if (characterData.Race.RacialTraits) {
			for (const traitKey in characterData.Race.RacialTraits) {
				const trait = characterData.Race.RacialTraits[traitKey];

				//don't include any ability score increases
				if (trait.Name.includes("Ability Score Increase")) {
					continue;
				}

				//trait container
				const traitContainer = document.createElement('div');
				traitContainer.classList.add('feature-item');

				//trait button container
				const traitButton = document.createElement('div');
				traitButton.classList.add('feature-button');
				featureButton.title = "Press to expand description";

				// title button
				const titleButton = document.createElement('button');
				titleButton.classList.add('styled-button');
				titleButton.style.color = "#6385C1";
				titleButton.style.fontWeight = "bold";
				titleButton.style.minWidth = "auto";
				titleButton.title = "Press to send to sidebar";
				titleButton.style.padding = "4px 8px";
				titleButton.style.margin = "0";
				titleButton.textContent = trait.Name;

				//arrow - right
				const arrowSpan = document.createElement('span');
				arrowSpan.classList.add('arrow-icon');
				arrowSpan.innerHTML = '▶';

				traitButton.appendChild(titleButton);
				traitButton.appendChild(arrowSpan);

				const hasLimitedUse = checkForLimitedUse(trait.Name);

				// If the feature has limited uses, add a usage tracker
				if (hasLimitedUse) {
					const usageTracker = createUsageTracker(trait.Name, hasLimitedUse);
					traitButton.appendChild(titleButton);
					traitButton.appendChild(usageTracker);
					traitButton.appendChild(arrowSpan);
				} else {
					traitButton.appendChild(titleButton);
					traitButton.appendChild(arrowSpan);
				}

				//description container
				const traitDesc = document.createElement('div');
				traitDesc.classList.add('feature-description');

				//proces description
				let descriptionText = trait.Description.replaceAll("� ", "• ") || "No description available";
				const processedTraitDescription = createProcessedDescription(descriptionText);
				traitDesc.appendChild(processedTraitDescription);

				titleButton.addEventListener('click', function (event) {
					event.stopPropagation();
					const message = `${trait.Name}\n_______________\n${descriptionText}`;
					sendDataToSidebar(message, characterData.Name);
				});

				traitButton.addEventListener('click', function (event) {
					if (event.target !== titleButton) {
						if (traitDesc.style.display === 'none' || traitDesc.style.display === '') {
							traitDesc.style.display = 'block';
							arrowSpan.classList.add('arrow-down');
						} else {
							traitDesc.style.display = 'none';
							arrowSpan.classList.remove('arrow-down');
						}
					}
				});

				traitContainer.appendChild(traitButton);
				traitContainer.appendChild(traitDesc);
				traitContainer.appendChild(document.createElement('hr'));

				racialFeatures.appendChild(traitContainer);
			}
		}
	}

	//add feats
	const featFeatures = content.querySelector('#featFeatures');
	if (characterData.Feats) {
		for (const featKey in characterData.Feats) {
			const feat = characterData.Feats[featKey];

			//don't include any ability score increases
			if (feat.Name.includes("Ability Score Increase")) {
				continue;
			}

			//feat container
			const featContainer = document.createElement('div');
			featContainer.classList.add('feature-item');

			//feat button container
			const featButton = document.createElement('div');
			featButton.classList.add('feature-button');
			featButton.title = "Press to expand description";

			// title button
			const titleButton = document.createElement('button');
			titleButton.classList.add('styled-button');
			titleButton.style.color = "#6385C1";
			titleButton.style.fontWeight = "bold";
			titleButton.style.minWidth = "auto";
			titleButton.style.padding = "4px 8px";
			titleButton.title = "Press to send to sidebar";
			titleButton.style.margin = "0";
			titleButton.textContent = feat.Name;

			//arrow - right
			const arrowSpan = document.createElement('span');
			arrowSpan.classList.add('arrow-icon');
			arrowSpan.innerHTML = '▶';

			featButton.appendChild(titleButton);
			featButton.appendChild(arrowSpan);

			const hasLimitedUse = checkForLimitedUse(feat.Name);

			// If the feature has limited uses, add a usage tracker
			if (hasLimitedUse) {
				const usageTracker = createUsageTracker(feat.Name, hasLimitedUse);
				featButton.appendChild(titleButton);
				featButton.appendChild(usageTracker);
				featButton.appendChild(arrowSpan);
			} else {
				featButton.appendChild(titleButton);
				featButton.appendChild(arrowSpan);
			}

			//feat container
			const featDesc = document.createElement('div');
			featDesc.classList.add('feature-description');

			//process description
			const descriptionText = feat.Description.replaceAll("� ", "• ") || feat.Snippet || "No description available";
			const processedFeatDescription = createProcessedDescription(descriptionText);
			featDesc.appendChild(processedFeatDescription);

			titleButton.addEventListener('click', function (event) {
				event.stopPropagation();
				const message = `${feat.Name}\n_______________\n${descriptionText}`;
				sendDataToSidebar(message, characterData.Name);
			});

			featButton.addEventListener('click', function (event) {
				if (event.target !== titleButton) {
					if (featDesc.style.display === 'none' || featDesc.style.display === '') {
						featDesc.style.display = 'block';
						arrowSpan.classList.add('arrow-down');
					} else {
						featDesc.style.display = 'none';
						arrowSpan.classList.remove('arrow-down');
					}
				}
			});

			featContainer.appendChild(featButton);
			featContainer.appendChild(featDesc);
			featContainer.appendChild(document.createElement('hr'));

			featFeatures.appendChild(featContainer);
		}
	}

	// Add menu button event listeners
	const actionButton = content.querySelector('#actions');
	actionButton.addEventListener('click', () => showActions(adventureData));

	const bioButton = content.querySelector('#bio');
	bioButton.addEventListener('click', () => showBio(adventureData));

	const characterButton = content.querySelector('#character');
	characterButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
		createCharacterSheet(adventureData);
	});

	const inventoryButton = content.querySelector('#inventory');
	inventoryButton.addEventListener('click', () => showInventory(adventureData));

	const spellsButton = content.querySelector('#spells');
	spellsButton.addEventListener('click', () => showSpells(adventureData));

	const extrasButton = content.querySelector("#extras");
	extrasButton.addEventListener('click', function () {
		showExtras(adventureData);
	});

	setupDiceRollHandlers();
}

function showInventory(adventureData) {
	const characterSheetOverlay = document.getElementById('customOverlay');
	characterSheetOverlay.style.width = "500px";

	const content = document.getElementById('overlayContainer');
	content.innerHTML = '';

	let characterHidden = "";

	if (adventureData.characters.character.length != null) {
		for (let i = 0; i < adventureData.characters.character.length; i++) {
			if (adventureData.characters.character[i].name === characterData.Name) {
				if (adventureData.characters.character[i].hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}
	} else {
		if (adventureData.characters.character.hidden === "yes") {
			characterHidden = "[hidden]";
		}
	}

	const header = document.getElementById('titleBar');
	header.innerHTML = `${characterData.Name} - Inventory ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	const closeButton = header.querySelector('.close');
	closeButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
	});

	content.innerHTML = `
        <div id="overlayContainer" style="display: flex;">
            <div class="inventoryDiv" style="height: 495px; width: 350px; margin-left: 0px; margin-top: 0px; overflow: auto; border: 2px solid #336699; padding: 10px;">
                <div class="inventory-header">
                    <span class="item-name">Equipment</span>
                    <span class="item-quantity">Quantity</span>
                    <span class="item-cost">Cost(GP)</span>
                </div>
                <div id="allInventory"></div>
            </div>
            <div style="display: flex; flex-direction: column;">
                <div class="Character-menu-container">
                    <div class="character-menu menu-panel" style="border: 2px solid #336699; padding: 5px; height: 230px; margin-left: 3px; margin-top: 0px;">
                        <button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="width: 100px; margin-top: 5px;">Actions</button>
                        <button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Bio</button>
                        <button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Character</button>
                        <button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Features</button>
                        <button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Inventory</button>
                        <button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Spells</button>
						<button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
                    </div>
                </div>
                <div id="currencyList" style="border: 2px solid #336699; padding: 8px; padding-left: 2px; padding-right: 2px; height: 260px; width: 120px; margin-top: 5px; margin-left: 3px; overflow-y: auto;">
                    <div style="margin-left: 5px;">
                        ${characterData.Currencies.pp ? `<label style="margin-left: 10px;">PP&nbsp;:&nbsp;&nbsp;<code>${characterData.Currencies.pp}</code></label><hr class="hrBreakline">` : ''}
                        ${characterData.Currencies.gp ? `<label style="margin-left: 10px;">GP&nbsp;:&nbsp;&nbsp;<code>${characterData.Currencies.gp}</code></label><hr class="hrBreakline">` : ''}
                        ${characterData.Currencies.ep ? `<label style="margin-left: 10px;">EP&nbsp;:&nbsp;&nbsp;<code>${characterData.Currencies.ep}</code></label><hr class="hrBreakline">` : ''}
                        ${characterData.Currencies.sp ? `<label style="margin-left: 10px;">SP&nbsp;:&nbsp;&nbsp;<code>${characterData.Currencies.sp}</code></label><hr class="hrBreakline">` : ''}
                        ${characterData.Currencies.cp ? `<label style="margin-left: 10px;">CP&nbsp;:&nbsp;&nbsp;<code>${characterData.Currencies.cp}</code></label>` : ''}
                    </div>
					<hr style="height: 1.5px; background-color: #d3d3d3; margin-top: 0px; border-radius: 10px; margin-bottom: 5px;">
					<p id="carryWeight" style="text-align: center; font-size: 14px;">Total carrying weight: </p> 
                </div>
            </div>
        </div>
    `;

	//search bar feature
	const inventoryDiv = content.querySelector('.inventoryDiv');
	const searchBar = addSearchBar(inventoryDiv, '.inventory-item-container', (items, searchTerm) => {
		items.forEach(item => {
			const nameButton = item.querySelector('.buttonNameWrap');
			const description = item.querySelector('.item-description');

			const nameText = nameButton ? nameButton.textContent.toLowerCase() : '';
			const descriptionText = description ? description.textContent.toLowerCase() : '';

			const isMatch = nameText.includes(searchTerm) || descriptionText.includes(searchTerm);

			item.style.display = isMatch ? '' : 'none';
		});
	});

	const inventoryHeader = inventoryDiv.querySelector('.inventory-header');
	inventoryDiv.insertBefore(searchBar, inventoryHeader.nextSibling);

	const allInventoryDiv = content.querySelector('#allInventory');

	if (characterData.Inventory && Object.keys(characterData.Inventory).length > 0) {
		if (characterData.Inventory && Object.keys(characterData.Inventory).length > 0) {
			for (let i = 0; i < Object.keys(characterData.Inventory).length; i++) {
				const item = characterData.Inventory[i];

				// Check if the item and its definition exist
				if (item && item.Definition) {
					const itemDefinition = item.Definition;

					// Item container
					const itemContainer = document.createElement('div');
					itemContainer.classList.add('inventory-item-container');

					// Row for each item
					const itemRow = document.createElement('div');
					itemRow.classList.add('inventory-item');

					// Item button
					const itemButton = document.createElement('button');
					itemButton.textContent = itemDefinition.Name;
					itemButton.title = "Press to send to sidebar";
					itemButton.classList.add('buttonNameWrap', 'item-name');

					// Quantity label
					const quantityLabel = document.createElement('span');
					quantityLabel.textContent = item.Quantity;
					quantityLabel.title = `${itemDefinition.Name} quantity`;
					quantityLabel.classList.add('item-quantity');

					// Cost label
					const costLabel = document.createElement('span');
					costLabel.textContent = itemDefinition.Cost || "-";
					costLabel.title = `${itemDefinition.Name} cost`;
					costLabel.classList.add('item-cost');

					itemRow.appendChild(itemButton);
					itemRow.appendChild(quantityLabel);
					itemRow.appendChild(costLabel);

					// Item description
					const itemDescription = document.createElement('div');
					itemDescription.classList.add('item-description');

					// Process description
					const processedDescription = createProcessedDescription(
						itemDefinition.Description || "No description available"
					);

					itemDescription.appendChild(processedDescription);

					// Horizontal line
					const breakline = document.createElement('hr');

					itemContainer.appendChild(itemRow);
					itemContainer.appendChild(itemDescription);
					itemContainer.appendChild(breakline);

					allInventoryDiv.appendChild(itemContainer);

					itemButton.addEventListener('click', function () {
						const cleanDescription = itemDefinition.Description
							? removeHtmlTags(itemDefinition.Description)
							: "No description available";

						const message = `${itemDefinition.Name}\n_______________\n` +
							`Quantity: ${item.Quantity}\n` +
							`Cost: ${itemDefinition.Cost || "Unknown"}\n\n` +
							`${cleanDescription}`;

						sendDataToSidebar(message, characterData.Name);
					});
				}
			}
		}
	} else {
		const noInventoryMessage = document.createElement('p');
		noInventoryMessage.textContent = "No inventory items available.";
		allInventoryDiv.appendChild(noInventoryMessage);
	}

	//calculate the total item weight
	const currencyList = content.querySelector('#currencyList');
	const weightElement = currencyList.querySelector('#carryWeight');
	let totalWeight = 0;

	if (characterData.Inventory ** Object.keys(characterData.Inventory).length > 0) {
		for (let i = 0; o < Object.keys(characterData.Inventory).length; i++) {
			const item = characterData.Inventory[i];
			const itemWeight = item.Definition.Weight || 0;
			totalWeight += itemWeight * item.Quantity;
		}
	}

	//add the coin weight if the preferences is not set to ignore
	if (!characterData.Preferences.ignoreCoinWeight) {
		const copper = characterData.Currencies.cp || 0;
		const silver = characterData.Currencies.sp || 0;
		const electrum = characterData.Currencies.ep || 0;
		const gold = characterData.Currencies.gp || 0;
		const platinum = characterData.Currencies.pp || 0;

		const totalCoins = copper + silver + electrum + gold + platinum;
		const coinWeight = Math.floor(totalCoins / 50);

		totalWeight += coinWeight;
	}

	weightElement.innerHTML = `Total carrying weight: <br><code>${totalWeight} lbs</code>`;

	const maxCarryWeight = characterData.MaxCarryWeight || 0;
	if (maxCarryWeight > 0) {
		weightElement.innerHTML += `<code>/ ${maxCarryWeight} lbs</code>`;
	}

	//event listeners
	const actionButton = content.querySelector('#actions');
	actionButton.addEventListener('click', () => showActions(adventureData));

	const bioButton = content.querySelector('#bio');
	bioButton.addEventListener('click', () => showBio(adventureData));

	const characterButton = content.querySelector('#character');
	characterButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
		createCharacterSheet(adventureData);
	});

	const featuresButton = content.querySelector('#features');
	featuresButton.addEventListener('click', () => showFeatures(adventureData));

	const inventoryButton = content.querySelector('#inventory');
	inventoryButton.addEventListener('click', () => showInventory(adventureData));

	const spellsButton = content.querySelector('#spells');
	spellsButton.addEventListener('click', () => showSpells(adventureData));

	const extrasButton = content.querySelector("#extras");
	extrasButton.addEventListener('click', function () {
		showExtras(adventureData);
	});

	setupDiceRollHandlers();
}

function showSpells(adventureData) {
	const characterSheetOverlay = document.getElementById('customOverlay');
	characterSheetOverlay.style.width = "500px";

	const content = document.getElementById('overlayContainer');
	content.innerHTML = '';

	let characterHidden = "";

	// Get character's hidden status from adventure data
	if (Array.isArray(adventureData.characters.character)) {
		for (let i = 0; i < adventureData.characters.character.length; i++) {
			if (adventureData.characters.character[i].name === characterData.Name) {
				if (adventureData.characters.character[i].hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}
	} else {
		if (adventureData.characters.character.hidden === "yes") {
			characterHidden = "[hidden]";
		}
	}

	const header = document.getElementById('titleBar');
	header.innerHTML = `${characterData.Name} - Spells ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	// Add close button functionality
	const closeButton = header.querySelector('.close');
	closeButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
	});

	content.innerHTML = `
        <div id="overlayContainer" style="display: flex;">
            <div style="height: 495px; width: 350px; margin-left: 0px; margin-top: 0px; overflow: auto; border: 2px solid #336699; padding: 10px;">
                <!-- Spell Save DC and Attack Bonus -->
                <div style="display: flex; margin-bottom: 15px; border-bottom: 1px solid #336699; padding-bottom: 10px;">
                    <div style="flex: 1; text-align: center;">
                        <label style="font-weight: bold;">Spell Save DC</label>
                        <div style="font-size: 24px; font-weight: bold;">${calculateSpellSaveDC()}</div>
                    </div>
                    <div style="flex: 1; text-align: center;">
                        <label style="font-weight: bold;">Spell Attack Bonus</label>
                        <div style="font-size: 24px; font-weight: bold;">+${calculateSpellAttackBonus()}</div>
                    </div>
                </div>
                
                <!-- Cantrips -->
                <div class="spell-level-container">
                    <h4>Cantrips</h4>
                    <div id="cantrips">
                        <!-- Cantrips will be added here dynamically -->
                    </div>
                </div>
                
                <!-- Known Spells by level -->
                <div id="spellContainer">
                    <!-- Each spell level will be added here -->
                </div>
            </div>
            <div class="Character-menu-container" style="position: absolute; margin-top: 23px; right: 0;">
                <div class="character-menu menu-panel" style="border: 2px solid #336699; padding: 5px; height: 230px;">
                    <button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="width: 100px; margin-top: 5px;">Actions</button>
                    <button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Bio</button>
                    <button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Character</button>
                    <button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Features</button>
                    <button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Inventory</button>
                    <button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Spells</button>
                    <button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
                </div>
            </div>
        </div>
    `;

	// Search bar feature
	const spellsDiv = content.querySelector('div[style*="height: 495px"]');
	const searchBar = addSearchBar(spellsDiv, '.spell-container', (items, searchTerm) => {
		items.forEach(item => {
			const titleButton = item.querySelector('.styled-button');
			const spellInfo = item.querySelector('.spell-info');
			const description = item.querySelector('.feature-description');

			const titleText = titleButton ? titleButton.textContent.toLowerCase() : '';
			const infoText = spellInfo ? spellInfo.textContent.toLowerCase() : '';
			const descriptionText = description ? description.textContent.toLowerCase() : '';

			const isMatch = titleText.includes(searchTerm) ||
				infoText.includes(searchTerm) ||
				descriptionText.includes(searchTerm);

			if (isMatch) {
				item.style.display = '';
				if ((infoText.includes(searchTerm) || descriptionText.includes(searchTerm)) &&
					!titleText.includes(searchTerm)) {
					if (spellInfo) spellInfo.style.display = 'block';
					if (description) description.style.display = 'block';
					const arrow = item.querySelector('.arrow-icon');
					if (arrow) arrow.classList.add('arrow-down');
				}
			} else {
				item.style.display = 'none';
			}
		});

		spellsDiv.querySelectorAll('.spell-level-container').forEach(levelContainer => {
			const hasVisibleSpells = Array.from(levelContainer.querySelectorAll('.spell-container'))
				.some(spell => spell.style.display !== 'none');

			levelContainer.style.display = hasVisibleSpells || searchTerm === '' ? '' : 'none';
		});
	});

	const spellSaveDcSection = spellsDiv.querySelector('div[style*="display: flex; margin-bottom: 15px"]');
	spellsDiv.insertBefore(searchBar, spellSaveDcSection.nextSibling);

	// Populate cantrips and spells
	const cantripsContainer = content.querySelector('#cantrips');
	const spellContainer = content.querySelector('#spellContainer');

	const spellsByLevel = {};

	if (characterData.Spells) {
		for (const spellKey in characterData.Spells) {
			const spell = characterData.Spells[spellKey];
			if (spell && spell.Definition) {
				const level = spell.Definition.Level;

				if (!spellsByLevel[level]) {
					spellsByLevel[level] = [];
				}

				spellsByLevel[level].push(spell);
			}
		}

		for (const level in spellsByLevel) {
			spellsByLevel[level].sort((a, b) => {
				return a.Definition.Name.localeCompare(b.Definition.Name);
			});
		}
	}

	if (spellsByLevel[0] && spellsByLevel[0].length > 0) {
		spellsByLevel[0].forEach(spell => {
			addSpellToContainer(spell, cantripsContainer);
		});
	} else {
		const noSpellsMsg = document.createElement('p');
		noSpellsMsg.textContent = "No cantrips known.";
		noSpellsMsg.style.fontStyle = 'italic';
		noSpellsMsg.style.color = '#666';
		cantripsContainer.appendChild(noSpellsMsg);
	}

	//Warlock Pact Magic
	const isWarlock = characterData.Classes &&
		characterData.Classes[0] &&
		characterData.Classes[0].Definition &&
		characterData.Classes[0].Definition.Name === "Warlock";

	if (isWarlock) {
		const warlockContainer = document.createElement('div');
		warlockContainer.classList.add('spell-level-container');
		warlockContainer.style.backgroundColor = '#f0f0f0';
		warlockContainer.style.padding = '10px';
		warlockContainer.style.marginBottom = '15px';

		//h4 element
		const warlockHeader = document.createElement('h4');
		warlockHeader.textContent = 'Pact Magic Spell Slots';
		warlockContainer.appendChild(warlockHeader);

		const warlockLevel = characterData.Classes[0].Level;
		const highestSpellLevel = findHighestWarlockSpellLevel(characterData);
		const slotsCount = getPactSlotsCount(warlockLevel);
		const slotsUsed = characterData.Pact.SlotsUsed;

		// Create slot indicators for Warlocks
		const slotsContainer = document.createElement('div');
		slotsContainer.classList.add('spell-slots-container');

		const label = document.createElement('span');
		label.textContent = 'Pact Magic Slots: ';
		label.style.fontWeight = 'bold';
		slotsContainer.appendChild(label);

		//pact spell slot indications
		for (let i = 0; i < slotsCount; i++) {
			const slotElement = document.createElement('div');
			slotElement.classList.add('spell-slot');

			if (i < slotsUsed) {
				slotElement.classList.add('used');
				slotElement.title = 'Used spell slot (click to restore)';
			} else {
				slotElement.classList.add('available');
				slotElement.title = 'Available spell slot (click to use)';
			}

			slotElement.setAttribute('data-slot-type', 'pact');
			slotElement.setAttribute('data-index', i);

			slotElement.addEventListener('click', function () {
				if (this.classList.contains('available')) {
					this.classList.remove('available');
					this.classList.add('used');
					this.title = 'Used spell slot (click to restore)';

					characterData.Pact.SlotsUsed = Math.min(
						(characterData.Pact.SlotsUsed || 0) + 1,
						slotsCount
					);
					chrome.storage.local.set({ 'characterData': characterData }, function () {
						chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
							if (result.activeCharacterId && result.characters &&
								result.characters[result.activeCharacterId]) {
								result.characters[result.activeCharacterId].Pact = characterData.Pact;
								chrome.storage.local.set({ 'characters': result.characters });
							}
						});
					});
					//description
					description.innerHTML = `As a level ${warlockLevel} Warlock, you have <b>${slotsCount - characterData.Pact.SlotsUsed}</b> of <b>${slotsCount}</b> spell slots of level <b>${highestSpellLevel}</b> that regenerate on a short rest.`;
					// counter
					counter.textContent = ` (${slotsCount - characterData.Pact.SlotsUsed}/${slotsCount})`;

					updateWarlockSpellSelectors();
				} else {
					this.classList.remove('used');
					this.classList.add('available');
					this.title = 'Available spell slot (click to use)';

					characterData.Pact.SlotsUsed = Math.max(0, (characterData.Pact.SlotsUsed || 0) - 1);

					chrome.storage.local.set({ 'characterData': characterData }, function () {
						chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
							if (result.activeCharacterId && result.characters &&
								result.characters[result.activeCharacterId]) {
								result.characters[result.activeCharacterId].Pact = characterData.Pact;
								chrome.storage.local.set({ 'characters': result.characters });
							}
						});
					});

					// description
					description.innerHTML = `As a level ${warlockLevel} Warlock, you have <b>${slotsCount - characterData.Pact.SlotsUsed}</b> of <b>${slotsCount}</b> spell slots of level <b>${highestSpellLevel}</b> that regenerate on a short rest.`;

					// counter
					counter.textContent = ` (${slotsCount - characterData.Pact.SlotsUsed}/${slotsCount})`;
					updateWarlockSpellSelectors();
				}
			});

			slotsContainer.appendChild(slotElement);
		}

		//counter display
		const counter = document.createElement('span');
		counter.textContent = ` (${slotsCount - slotsUsed}/${slotsCount})`;
		counter.style.marginLeft = '5px';
		slotsContainer.appendChild(counter);
		warlockContainer.appendChild(slotsContainer);

		//description
		const description = document.createElement('p');
		description.innerHTML = `As a level ${warlockLevel} Warlock, you have <b>${slotsCount - slotsUsed}</b> of <b>${slotsCount}</b> spell slots of level <b>${highestSpellLevel}</b> that regenerate on a short rest.`;
		warlockContainer.appendChild(description);

		spellContainer.appendChild(warlockContainer);
	}

	//Each level of spells to the spell container
	for (let level = 1; level <= 9; level++) {
		const hasSpells = spellsByLevel[level] && spellsByLevel[level].length > 0;
		const hasSpellSlots = characterData.SpellSlots &&
			characterData.SpellSlots[level - 1] &&
			characterData.SpellSlots[level - 1].Available > 0;

		// Skip levels with no spells and no slots
		if (!hasSpells && !hasSpellSlots) {
			continue;
		}

		const levelContainer = document.createElement('div');
		levelContainer.classList.add('spell-level-container');

		const levelHeader = document.createElement('h4');
		levelHeader.textContent = `Level ${level}`;
        levelHeader.classList.add('spell-level-header');
		levelContainer.appendChild(levelHeader);

		// Add spell slot indicators for non-Warlocks
		if (hasSpellSlots && !isWarlock) {
			const spellSlotData = characterData.SpellSlots[level - 1];
			const slotsContainer = document.createElement('div');
			slotsContainer.classList.add('spell-slots-container');

			const label = document.createElement('span');
			label.textContent = 'Spell Slots: ';
			label.style.fontWeight = 'bold';
			slotsContainer.appendChild(label);

			for (let i = 0; i < spellSlotData.Available; i++) {
				const slotElement = document.createElement('div');
				slotElement.classList.add('spell-slot');

				if (i < spellSlotData.Used) {
					slotElement.classList.add('used');
					slotElement.title = 'Used spell slot (click to restore)';
				} else {
					slotElement.classList.add('available');
					slotElement.title = 'Available spell slot (click to use)';
				}

				slotElement.setAttribute('data-level', level);
				slotElement.setAttribute('data-index', i);

				slotElement.addEventListener('click', function () {
					const slotLevel = parseInt(this.getAttribute('data-level')) - 1;

					if (this.classList.contains('available')) {
						this.classList.remove('available');
						this.classList.add('used');
						this.title = 'Used spell slot (click to restore)';

						if (characterData.SpellSlots && characterData.SpellSlots[slotLevel]) {
							characterData.SpellSlots[slotLevel].Used = Math.min(
								characterData.SpellSlots[slotLevel].Used + 1,
								characterData.SpellSlots[slotLevel].Available
							);

							// Update counter text
							const counter = this.parentNode.querySelector('span:last-child');
							if (counter) {
								counter.textContent = ` (${characterData.SpellSlots[slotLevel].Available - characterData.SpellSlots[slotLevel].Used}/${characterData.SpellSlots[slotLevel].Available})`;
							}

							chrome.storage.local.set({ 'characterData': characterData });

							// Update all spell level selectors that reference this level
							updateSpellLevelSelectors(slotLevel + 1);
						}
					} else {
						this.classList.remove('used');
						this.classList.add('available');
						this.title = 'Available spell slot (click to use)';

						if (characterData.SpellSlots && characterData.SpellSlots[slotLevel]) {
							characterData.SpellSlots[slotLevel].Used = Math.max(0, characterData.SpellSlots[slotLevel].Used - 1);

							// Update counter text
							const counter = this.parentNode.querySelector('span:last-child');
							if (counter) {
								counter.textContent = ` (${characterData.SpellSlots[slotLevel].Available - characterData.SpellSlots[slotLevel].Used}/${characterData.SpellSlots[slotLevel].Available})`;
							}

							chrome.storage.local.set({ 'characterData': characterData });

							// Update all spell level selectors that reference this level
							updateSpellLevelSelectors(slotLevel + 1);
						}
					}
				});

				slotsContainer.appendChild(slotElement);
			}

			//counter display
			const counter = document.createElement('span');
			counter.textContent = ` (${spellSlotData.Available - spellSlotData.Used}/${spellSlotData.Available})`;
			counter.style.marginLeft = '5px';
			slotsContainer.appendChild(counter);

			levelContainer.appendChild(slotsContainer);
		}

		//spell list
		if (hasSpells) {
			const spellsWrapper = document.createElement('div');
			spellsByLevel[level].forEach(spell => {
				addSpellToContainer(spell, spellsWrapper);
			});
			levelContainer.appendChild(spellsWrapper);
		} else {
			const noSpellsMsg = document.createElement('p');
			noSpellsMsg.textContent = "No known spells of this level.";
			noSpellsMsg.style.fontStyle = 'italic';
			noSpellsMsg.style.color = '#666';
			levelContainer.appendChild(noSpellsMsg);
		}

		spellContainer.appendChild(levelContainer);
	}

	// menu button event listeners
	const actionButton = content.querySelector('#actions');
	actionButton.addEventListener('click', () => showActions(adventureData));

	const bioButton = content.querySelector('#bio');
	bioButton.addEventListener('click', () => showBio(adventureData));

	const characterButton = content.querySelector('#character');
	characterButton.addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
		createCharacterSheet(adventureData);
	});

	const featuresButton = content.querySelector('#features');
	featuresButton.addEventListener('click', () => showFeatures(adventureData));

	const inventoryButton = content.querySelector('#inventory');
	inventoryButton.addEventListener('click', () => showInventory(adventureData));

	const extrasButton = content.querySelector("#extras");
	extrasButton.addEventListener('click', function () {
		showExtras(adventureData);
	});

	setupDiceRollHandlers();

	function calculateSpellSaveDC() {
		let spellcastingAbilityModifier = 0;
		const characterClass = characterData.Classes && characterData.Classes[0]?.Definition?.Name;

		switch (characterClass) {
			case "Wizard":
			case "Artificer":
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Intelligence;
				break;
			case "Cleric":
			case "Druid":
			case "Ranger":
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Wisdom;
				break;
			case "Bard":
			case "Paladin":
			case "Sorcerer":
			case "Warlock":
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Charisma;
				break;
			default:
				// Default to Intelligence if class not recognized
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Intelligence;
		}

		return 8 + characterData.ProficiencyBonus + spellcastingAbilityModifier;
	}

	function calculateSpellAttackBonus() {
		let spellcastingAbilityModifier = 0;
		const characterClass = characterData.Classes && characterData.Classes[0]?.Definition?.Name;

		switch (characterClass) {
			case "Wizard":
			case "Artificer":
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Intelligence;
				break;
			case "Cleric":
			case "Druid":
			case "Ranger":
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Wisdom;
				break;
			case "Bard":
			case "Paladin":
			case "Sorcerer":
			case "Warlock":
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Charisma;
				break;
			default:
				// Default to Intelligence if class not recognized
				spellcastingAbilityModifier = characterData.AbilityScores.Modifier.Intelligence;
		}

		return characterData.ProficiencyBonus + spellcastingAbilityModifier;
	}

	function updateSpellLevelSelectors(level) {
		document.querySelectorAll('.spell-level-selector').forEach(selector => {
			const options = selector.querySelectorAll('option');
			options.forEach(option => {
				if (option.value == level && !option.value.startsWith('pact-')) {
					if (characterData.SpellSlots && characterData.SpellSlots[level - 1]) {
						const slotData = characterData.SpellSlots[level - 1];
						option.disabled = slotData.Used >= slotData.Available;
					}
				}
			});
		});
	}
}

function addSpellToContainer(spell, container) {
	const spellContainer = document.createElement('div');
	spellContainer.classList.add('spell-container');

	// Button container
	const spellButtonContainer = document.createElement('div');
	spellButtonContainer.classList.add('feature-button');
	spellButtonContainer.style.display = 'flex';
	spellButtonContainer.style.alignItems = 'center';
	spellButtonContainer.style.justifyContent = 'space-between';
	spellButtonContainer.title = "Press to expand description";

	const leftSide = document.createElement('div');
	leftSide.style.display = 'flex';
	leftSide.style.alignItems = 'center';

	// Spell button
	const spellTitleButton = document.createElement('button');
	spellTitleButton.classList.add('styled-button');
	spellTitleButton.style.color = "#6385C1";
	spellTitleButton.style.fontWeight = "bold";
	spellTitleButton.style.minWidth = "auto";
	spellTitleButton.style.padding = "4px 8px";
	spellTitleButton.style.margin = "0";
	spellTitleButton.title = "Press to cast spell";
	spellTitleButton.textContent = spell.Definition.Name;

	// Spell prepared indicator
	if (spell.Prepared) {
		const preparedIcon = document.createElement('span');
		preparedIcon.innerHTML = ' ✓';
		preparedIcon.title = 'Spell is prepared';
		preparedIcon.style.color = '#3d8b3d';
		spellTitleButton.appendChild(preparedIcon);
	}

	leftSide.appendChild(spellTitleButton);

	// Level indicator
	const spellLevel = spell.Definition.Level;
	const canBeUpcast = spellLevel > 0 && spell.Definition.Description.includes("At Higher Levels") || spell.Definition.Description.includes("Higher-Level");

	let levelSelector = null;
	if (canBeUpcast) {
		levelSelector = document.createElement('select');
		levelSelector.classList.add('spell-level-selector');
		levelSelector.style.marginLeft = '8px';
		levelSelector.style.height = '24px';
		levelSelector.style.fontSize = '12px';

		// Find the highest available spell slot level
		let maxLevel = 9;

		for (let level = spellLevel; level <= maxLevel; level++) {
			const hasSlots = characterData.SpellSlots &&
				characterData.SpellSlots[level - 1] &&
				characterData.SpellSlots[level - 1].Available > 0 &&
				characterData.SpellSlots[level - 1].Used < characterData.SpellSlots[level - 1].Available;

			const option = document.createElement('option');
			option.value = level;
			option.textContent = `Level ${level}`;
			option.disabled = !hasSlots;

			if (level === spellLevel) {
				option.selected = true;
			}

			levelSelector.appendChild(option);
		}

		// For Warlocks, add the Pact Magic option
		if (characterData.Classes && characterData.Classes[0]?.Definition.Name === "Warlock") {
			const warlockLevel = characterData.Classes[0].Level;
			const pactLevel = findHighestWarlockSpellLevel(characterData);

			if (spellLevel <= pactLevel) {
				const pactSlotsTotal = getPactSlotsCount(warlockLevel);
				const pactSlotsUsed = characterData.Pact?.SlotsUsed || 0;
				const hasPactSlots = pactSlotsUsed < pactSlotsTotal;

				const pactOption = document.createElement('option');
				pactOption.value = `pact-${pactLevel}`;
				pactOption.textContent = `Pact Magic (${pactLevel})`;
				pactOption.disabled = !hasPactSlots;

				levelSelector.appendChild(pactOption);
			}
		}

		leftSide.appendChild(levelSelector);
	}

	// Right side with arrow icon
	const arrowIcon = document.createElement('span');
	arrowIcon.classList.add('arrow-icon');
	arrowIcon.innerHTML = '▶';

	// elements to container
	spellButtonContainer.appendChild(leftSide);
	spellButtonContainer.appendChild(arrowIcon);

	// Spell info div
	const spellInfo = document.createElement('div');
	spellInfo.classList.add('spell-info');
	spellInfo.style.display = 'none';

	// Spell information
	const components = spell.Definition.FormatSpell?.Components?.replace('Components: ', '') || '';
	const range = spell.Definition.FormatSpell?.Range?.replace('Range: ', '') || '';
	const castingTime = spell.Definition.FormatSpell?.Time?.replace('Casting Time: ', '') || '';
	const duration = spell.Definition.FormatSpell?.Duration?.replace('Duration: ', '') || '';

	spellInfo.innerHTML = `
      <div><strong>School:</strong> ${spell.Definition.FormatSpell?.SchoolLevel || ''}</div>
      <div><strong>Casting Time:</strong> ${castingTime}</div>
      <div><strong>Range:</strong> ${range}</div>
      <div><strong>Components:</strong> ${components}</div>
      <div><strong>Duration:</strong> ${duration}</div>
    `;

	// Spell description
	const spellDescription = document.createElement('div');
	spellDescription.classList.add('feature-description');
	spellDescription.style.display = 'none';

	// Process description with dice roll links
	const processedDescription = createProcessedDescription(spell.Definition.Description.replaceAll("� ", "• "));
	spellDescription.appendChild(processedDescription);

	// Highlight upcast sections for spells that can be upcast
	if (canBeUpcast) {
		const upcastRegex = /(At Higher Levels[^.]*\..*?)(?=\n\n|\n[A-Z]|$)/is;
		const match = spell.Definition.Description.match(upcastRegex);

		if (match) {
			const upcastSection = document.createElement('div');
			upcastSection.style.backgroundColor = '#f8f9fa';
			upcastSection.style.padding = '8px';
			upcastSection.style.marginTop = '10px';
			upcastSection.style.borderLeft = '3px solid #6385C1';

			const upcastTitle = document.createElement('strong');
			upcastTitle.textContent = 'At Higher Levels: ';

			const upcastText = document.createElement('span');
			upcastText.textContent = match[1].replace("At Higher Levels: ", "").replace("At Higher Levels.", "");

			upcastSection.appendChild(upcastTitle);
			upcastSection.appendChild(upcastText);
			spellDescription.appendChild(upcastSection);
		}
	}

	//Event listeners
	spellTitleButton.addEventListener('click', function (event) {
		event.stopPropagation();

		let selectedLevel = spellLevel;
		let isPactMagic = false;

		if (canBeUpcast && levelSelector) {
			const selectedValue = levelSelector.value;
			isPactMagic = selectedValue.startsWith('pact-');
			if (isPactMagic) {
				selectedLevel = parseInt(selectedValue.split('-')[1]);
			} else {
				selectedLevel = parseInt(selectedValue);
			}
		}

		const castingMessage = `Casting: ${spell.Definition.Name}`;
		sendDataToSidebar(castingMessage, characterData.Name);

		// spell slot usage
		if (spell.Definition.Level > 0) {
			//warlock
			if (isPactMagic || (characterData.Classes[0]?.Definition.Name === "Warlock" && !canBeUpcast)) {
				const pactLevel = findHighestWarlockSpellLevel(characterData);
				const warlockLevel = characterData.Classes[0].Level;
				const totalSlots = getPactSlotsCount(warlockLevel);

				if (spell.Definition.Level <= pactLevel && characterData.Pact.SlotsUsed < totalSlots) {
					characterData.Pact.SlotsUsed = Math.min(
						(characterData.Pact.SlotsUsed || 0) + 1,
						totalSlots
					);

					chrome.storage.local.set({ 'characterData': characterData }, function () {
						chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
							if (result.activeCharacterId && result.characters &&
								result.characters[result.activeCharacterId]) {
								result.characters[result.activeCharacterId].Pact = characterData.Pact;
								chrome.storage.local.set({ 'characters': result.characters });
							}
						});
					});

					//update the display and pact spell slots
					updateWarlockSpellSlotDisplay();
				}
			} else if (characterData.SpellSlots && selectedLevel > 0) {
				if (characterData.SpellSlots[selectedLevel - 1] &&
					characterData.SpellSlots[selectedLevel - 1].Used < characterData.SpellSlots[selectedLevel - 1].Available) {

					characterData.SpellSlots[selectedLevel - 1].Used++;

					// Update the UI for regular spell slots
					updateSpellSlotDisplay(selectedLevel);

					chrome.storage.local.set({ 'characterData': characterData });
				}
			}
		}
	});

	spellButtonContainer.addEventListener('click', function (event) {
		if (event.target !== spellTitleButton && !event.target.classList.contains('spell-level-selector')) {
			const isVisible = spellDescription.style.display === 'block';

			if (isVisible) {
				spellInfo.style.display = 'none';
				spellDescription.style.display = 'none';
				arrowIcon.classList.remove('arrow-down');
			} else {
				spellInfo.style.display = 'block';
				spellDescription.style.display = 'block';
				arrowIcon.classList.add('arrow-down');
			}
		}
	});

	// Build full spell container
	spellContainer.appendChild(spellButtonContainer);
	spellContainer.appendChild(spellInfo);
	spellContainer.appendChild(spellDescription);

	container.appendChild(spellContainer);
}

function updateSpellSlotDisplay(level) {
	// Find all spell level containers that match this level
	const levelContainers = document.querySelectorAll('.spell-level-container');

	levelContainers.forEach(container => {
		const header = container.querySelector('.spell-level-header');
		if (header && header.textContent === `Level ${level}`) {
			// Update the spell slot indicators
			const slots = container.querySelectorAll('.spell-slot');
			const slotData = characterData.SpellSlots[level - 1];

			if (slots && slotData) {
				slots.forEach((slot, index) => {
					if (index < slotData.Used) {
						slot.classList.remove('available');
						slot.classList.add('used');
						slot.title = 'Used spell slot (click to restore)';
					} else if (index < slotData.Available) {
						slot.classList.remove('used');
						slot.classList.add('available');
						slot.title = 'Available spell slot (click to use)';
					}
				});

				// Update the counter text
				const counter = container.querySelector('.spell-slots-container span:last-child');
				if (counter) {
					counter.textContent = ` (${slotData.Available - slotData.Used}/${slotData.Available})`;
				}
			}
		}
	});

	// Update all spell level selectors
	document.querySelectorAll('.spell-level-selector').forEach(selector => {
		const options = selector.querySelectorAll('option');
		options.forEach(option => {
			if (!option.value.startsWith('pact-')) {
				const optionLevel = parseInt(option.value);
				if (optionLevel === level) {
					const slotData = characterData.SpellSlots[level - 1];
					if (slotData) {
						option.disabled = slotData.Used >= slotData.Available;
					}
				}
			}
		});
	});
}

function updateWarlockSpellSlotDisplay() {
	// Find the Warlock pact magic container - use a more reliable selector
	const allLevelContainers = document.querySelectorAll('.spell-level-container');
	let warlockContainer = null;

	// Find the container with the "Pact Magic Spell Slots" header
	for (const container of allLevelContainers) {
		const header = container.querySelector('h4');
		if (header && header.textContent === 'Pact Magic Spell Slots') {
			warlockContainer = container;
			break;
		}
	}

	if (!warlockContainer) {
		return;  // Exit if container not found
	}

	const warlockLevel = characterData.Classes[0].Level;
	const pactLevel = findHighestWarlockSpellLevel(characterData);
	const totalSlots = getPactSlotsCount(warlockLevel);
	const slotsUsed = characterData.Pact.SlotsUsed || 0;

	const slotElements = warlockContainer.querySelectorAll('.spell-slot');
	slotElements.forEach((slot, index) => {
		if (index < slotsUsed) {
			slot.classList.remove('available');
			slot.classList.add('used');
			slot.title = 'Used spell slot (click to restore)';
		} else {
			slot.classList.remove('used');
			slot.classList.add('available');
			slot.title = 'Available spell slot (click to use)';
		}
	});

	const description = warlockContainer.querySelector('p');
	if (description) {
		description.innerHTML = `As a level ${warlockLevel} Warlock, you have <b>${totalSlots - slotsUsed}</b> of <b>${totalSlots}</b> spell slots of level <b>${pactLevel}</b> that regenerate on a short rest.`;
	}

	const counter = warlockContainer.querySelector('.spell-slots-container span:last-child');
	if (counter) {
		counter.textContent = ` (${totalSlots - slotsUsed}/${totalSlots})`;
	}

	updateWarlockSpellSelectors();
}

function updateWarlockSpellSelectors() {
	const warlockLevel = characterData.Classes[0]?.Level;
	if (!warlockLevel) return;

	const pactLevel = findHighestWarlockSpellLevel(characterData);
	const totalSlots = getPactSlotsCount(warlockLevel);
	const slotsUsed = characterData.Pact.SlotsUsed || 0;
	const hasPactSlots = slotsUsed < totalSlots;

	document.querySelectorAll('.spell-level-selector').forEach(selector => {
		Array.from(selector.options).forEach(opt => {
			if (opt.value && opt.value.startsWith('pact-')) {
				opt.disabled = !hasPactSlots;
			}
		});
	});
}

function getPactSlotsCount(level) {
	if (level >= 17) return 4;
	if (level >= 11) return 3;
	if (level >= 2) return 2;
	return 1;
}

function showExtras(adventureData) {
	const characterSheetOverlay = document.getElementById('customOverlay');
	characterSheetOverlay.style.width = "500px";

	const content = document.getElementById('overlayContainer');
	content.innerHTML = '';

	let characterHidden = "";
	if (adventureData.characters.character.length != null) {
		for (let i = 0; i < adventureData.characters.character.length; i++) {
			if (adventureData.characters.character[i].name === characterData.Name) {
				if (adventureData.characters.character[i].hidden === "yes") {
					characterHidden = "[hidden]";
				}
				break;
			}
		}
	} else if (adventureData.characters.character.hidden === "yes") {
		characterHidden = "[hidden]";
	}

	const header = document.getElementById('titleBar');
	header.innerHTML = `${characterData.Name} - Extras ${characterHidden} <span class="glyphicon glyphicon-remove close" aria-hidden="true"></span>`;

	header.querySelector('.close').addEventListener('click', function () {
		characterSheetOverlay.remove();
		characterSheetOpen = false;
	});

	content.innerHTML = `
        <div id="overlayContainer" style="display: flex;">
            <div style="height: 495px; width: 350px; margin-left: 0px; margin-top: 0px; overflow: auto; border: 2px solid #336699; padding: 10px;">
                <h4 style="margin-top: 0;"><b>Companion Creatures</b></h4>
                <div id="companionCreatures"></div>
                
                <h4 style="margin-top: 12px;"><b>Special Abilities</b></h4>
                <div id="specialAbilities"></div>
                
                <h4 style="margin-top: 12px;"><b>Temporary Effects</b></h4>
                <div id="tempEffects"></div>
            </div>
            <div class="Character-menu-container" style="position: absolute; margin-top: 23px; right: 0;">
                <div class="character-menu menu-panel" style="border: 2px solid #336699; padding: 5px; height: 230px;">
                    <button title="View all your character's actions that they can take turning combat." id="actions" class="btn btn-primary btn-xs menu-btn" style="width: 100px; margin-top: 5px;">Actions</button>
                    <button title="View your character's backstory, allies, foes, their background and more." id="bio" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Bio</button>
                    <button title="View your main character sheet. Abilities, skills, saving throws and more." id="character" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Character</button>
                    <button title="View all your character's features and actions, from races, classes, backgrounds and more." id="features" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Features</button>
                    <button title="View your character's inventory and all their hoards of items." id="inventory" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Inventory</button>
                    <button title="View your character's spells." id="spells" class="btn btn-primary btn-xs menu-btn" style="width: 100px;">Spells</button>
                    <button title="Extras include any special abilities, temporary effects and companions" id="extras" class="btn btn-primary btn-xs menu-btn">Extras</button>
                </div>
            </div>
        </div>
    `;

	// companion creatures
	const companionCreaturesDiv = content.querySelector('#companionCreatures');
	if (characterData.Creatures && Object.keys(characterData.Creatures).length > 0) {
		for (const creatureKey in characterData.Creatures) {
			const creature = characterData.Creatures[creatureKey];

			// container for this creature
			const creatureContainer = document.createElement('div');
			creatureContainer.classList.add('feature-item');

			//dropdown button container
			const featureButton = document.createElement('div');
			featureButton.classList.add('feature-button');
			featureButton.title = "Press to expand description";

			//title button
			const titleButton = document.createElement('button');
			titleButton.classList.add('styled-button');
			titleButton.style.color = "#6385C1";
			titleButton.style.fontWeight = "bold";
			titleButton.style.minWidth = "auto";
			titleButton.style.padding = "4px 8px";
			titleButton.style.margin = "0";
			titleButton.title = "Press to send to sidebar";
			titleButton.textContent = creature.Name;

			//arrow icon
			const arrowSpan = document.createElement('span');
			arrowSpan.classList.add('arrow-icon');
			arrowSpan.innerHTML = '▶';
			arrowSpan.style.marginLeft = "auto";

			featureButton.appendChild(titleButton);
			featureButton.appendChild(arrowSpan);

			const creatureDesc = document.createElement('div');
			creatureDesc.classList.add('feature-description');
			creatureDesc.style.display = 'none';

			// Format stats in a table
			const statsTable = document.createElement('table');
			statsTable.style.width = '100%';
			statsTable.style.marginTop = '5px';
			statsTable.style.fontSize = '12px';

			const statsRow1 = document.createElement('tr');
			const acCell = document.createElement('td');
			acCell.innerHTML = `<strong>AC:</strong> ${creature.ArmourClass}`;
			const hpCell = document.createElement('td');
			hpCell.innerHTML = `<strong>HP:</strong> ${creature.AverageHitPoints || creature.HitPoints || "—"}`;
			statsRow1.appendChild(acCell);
			statsRow1.appendChild(hpCell);
			statsTable.appendChild(statsRow1);

			if (creature.PassivePerception) {
				const statsRow2 = document.createElement('tr');
				const perceptionCell = document.createElement('td');
				perceptionCell.innerHTML = `<strong>Passive Perception:</strong> ${creature.PassivePerception}`;
				statsRow2.appendChild(perceptionCell);
				statsRow2.appendChild(document.createElement('td'));
				statsTable.appendChild(statsRow2);
			}

			creatureDesc.appendChild(statsTable);

			const abilityScores = document.createElement('div');
			abilityScores.style.display = 'grid';
			abilityScores.style.gridTemplateColumns = 'repeat(6, 1fr)';
			abilityScores.style.marginTop = '10px';
			abilityScores.style.textAlign = 'center';
			abilityScores.style.fontSize = '12px';

			const abilities = [
				{ name: 'STR', value: creature.Stats.Strength },
				{ name: 'DEX', value: creature.Stats.Dexterity },
				{ name: 'CON', value: creature.Stats.Constitution },
				{ name: 'INT', value: creature.Stats.Intelligence },
				{ name: 'WIS', value: creature.Stats.Wisdom },
				{ name: 'CHA', value: creature.Stats.Charisma }
			];

			abilities.forEach(ability => {
				const abilityDiv = document.createElement('div');
				abilityDiv.innerHTML = `<strong>${ability.name}</strong><br>${ability.value}`;
				abilityScores.appendChild(abilityDiv);
			});

			creatureDesc.appendChild(abilityScores);

			//special traits
			if (creature.SpecialTraitsDescription) {
				const traitsDiv = document.createElement('div');
				traitsDiv.style.marginTop = '10px';
				traitsDiv.innerHTML = `<strong>Traits:</strong><br>${creature.SpecialTraitsDescription}`;
				creatureDesc.appendChild(traitsDiv);
			}

			if (creature.ActionsDescription) {
				const actionsDiv = document.createElement('div');
				actionsDiv.style.marginTop = '10px';
				actionsDiv.innerHTML = `<strong>Actions:</strong><br>${creature.ActionsDescription}`;
				creatureDesc.appendChild(actionsDiv);
			}

			titleButton.addEventListener('click', function (event) {
				event.stopPropagation();
				let message = `${creature.Name}\n_______________\n`;
				message += `AC: ${creature.ArmourClass}, HP: ${creature.AverageHitPoints || creature.HitPoints || "—"}\n`;
				message += `STR: ${creature.Stats.Strength}, DEX: ${creature.Stats.Dexterity}, CON: ${creature.Stats.Constitution}, `;
				message += `INT: ${creature.Stats.Intelligence}, WIS: ${creature.Stats.Wisdom}, CHA: ${creature.Stats.Charisma}\n\n`;

				if (creature.SpecialTraitsDescription) {
					const plainTraits = creature.SpecialTraitsDescription.replace(/<[^>]*>/g, '');
					message += `${plainTraits}\n\n`;
				}

				if (creature.ActionsDescription) {
					const plainActions = creature.ActionsDescription.replace(/<[^>]*>/g, '');
					message += `${plainActions}`;
				}

				sendDataToSidebar(message, characterData.Name);
			});

			featureButton.addEventListener('click', function (event) {
				if (event.target !== titleButton) {
					if (creatureDesc.style.display === 'none') {
						creatureDesc.style.display = 'block';
						arrowSpan.classList.add('arrow-down');
					} else {
						creatureDesc.style.display = 'none';
						arrowSpan.classList.remove('arrow-down');
					}
				}
			});

			creatureContainer.appendChild(featureButton);
			creatureContainer.appendChild(creatureDesc);
			creatureContainer.appendChild(document.createElement('hr'));

			companionCreaturesDiv.appendChild(creatureContainer);
		}
	} else {
		companionCreaturesDiv.innerHTML = '<p style="font-style: italic; color: #666; margin: 5px 0;">No companion creatures available.</p>';
	}

	//special abilities
	const specialAbilitiesDiv = content.querySelector('#specialAbilities');
	const specialAbilities = [];

	//Dragon Wings from Draconic Sorcery and other special abilities
	if (characterData.Classes[0]?.SubClassDefinition?.Name === "Draconic Sorcery") {
		specialAbilities.push({
			name: "Dragon Wings",
			description: "As a Bonus Action, you can cause draconic wings to appear on your back. They last for 1 hour or until dismissed, granting 60 ft. fly speed.",
			limitedUse: { MaxUse: 1, rechargeType: "Long Rest" }
		});

		if (characterData.Classes[0].Level >= 18) {
			specialAbilities.push({
				name: "Dragon Companion",
				description: "Cast Summon Dragon without Material component. Once per long rest without using a spell slot.",
				limitedUse: { MaxUse: 1, rechargeType: "Long Rest" }
			});
		}
	}

	// special abilities 
	if (characterData.Actions) {
		for (const actionKey in characterData.Actions) {
			const action = characterData.Actions[actionKey];
			if (action.Name && (action.Name.includes("Wings") || action.Description?.includes("fly") || action.Name.includes("Summon"))) {
				specialAbilities.push({
					name: action.Name,
					description: action.Description || "No description available",
					limitedUse: action.LimitedUse
				});
			}
		}
	}

	// special abilities
	if (specialAbilities.length > 0) {
		specialAbilities.forEach(ability => {
			const abilityContainer = document.createElement('div');
			abilityContainer.classList.add('feature-item');

			// dropdown button container
			const featureButton = document.createElement('div');
			featureButton.classList.add('feature-button');

			// title button
			const titleButton = document.createElement('button');
			titleButton.classList.add('styled-button');
			titleButton.style.color = "#6385C1";
			titleButton.style.fontWeight = "bold";
			titleButton.style.minWidth = "auto";
			titleButton.style.padding = "4px 8px";
			titleButton.style.margin = "0";
			titleButton.textContent = ability.name;

			//arrow icon
			const arrowSpan = document.createElement('span');
			arrowSpan.classList.add('arrow-icon');
			arrowSpan.innerHTML = '▶';
			arrowSpan.style.marginLeft = "auto";
			arrowSpan.style.fontSize = "12px";

			featureButton.appendChild(titleButton);
			featureButton.appendChild(arrowSpan);

			const abilityDesc = document.createElement('div');
			abilityDesc.classList.add('feature-description');
			abilityDesc.style.display = 'none';

			//description
			const descDiv = document.createElement('div');
			descDiv.style.marginTop = '5px';
			descDiv.textContent = ability.description;
			abilityDesc.appendChild(descDiv);

			// Add limited use info
			if (ability.limitedUse && ability.limitedUse.MaxUse) {
				const usageDiv = document.createElement('div');
				usageDiv.style.marginTop = '5px';
				usageDiv.innerHTML = `<strong>Uses:</strong> ${ability.limitedUse.MaxUse} per ${ability.limitedUse.rechargeType || "rest"}`;
				abilityDesc.appendChild(usageDiv);
			}

			//click handlers
			titleButton.addEventListener('click', function (event) {
				event.stopPropagation();
				const message = `${ability.name}\n_______________\n${ability.description}`;
				sendDataToSidebar(message, characterData.Name);
			});

			featureButton.addEventListener('click', function (event) {
				if (event.target !== titleButton) {
					if (abilityDesc.style.display === 'none') {
						abilityDesc.style.display = 'block';
						arrowSpan.classList.add('arrow-down');
						arrowSpan.innerHTML = '▼';
					} else {
						abilityDesc.style.display = 'none';
						arrowSpan.classList.remove('arrow-down');
						arrowSpan.innerHTML = '▶';
					}
				}
			});

			abilityContainer.appendChild(featureButton);
			abilityContainer.appendChild(abilityDesc);
			abilityContainer.appendChild(document.createElement('hr'));

			specialAbilitiesDiv.appendChild(abilityContainer);
		});
	} else {
		specialAbilitiesDiv.innerHTML = '<p style="font-style: italic; color: #666; margin: 5px 0;">No special abilities available.</p>';
	}

	// temporary effects
	const tempEffectsDiv = content.querySelector('#tempEffects');
	const tempEffects = [];

	//Epic Boons
	if (characterData.Feats) {
		for (const featKey in characterData.Feats) {
			const feat = characterData.Feats[featKey];
			if (feat.Name && (feat.Name.includes("Boon") || feat.Description?.includes("temporary"))) {
				tempEffects.push({
					name: feat.Name,
					description: feat.Description || feat.Snippet || "No description available"
				});
			}
		}
	}

	//temporary effects
	if (tempEffects.length > 0) {
		tempEffects.forEach(effect => {
			const effectContainer = document.createElement('div');
			effectContainer.classList.add('feature-item');

			//dropdown button container
			const featureButton = document.createElement('div');
			featureButton.classList.add('feature-button');

			//title button
			const titleButton = document.createElement('button');
			titleButton.classList.add('styled-button');
			titleButton.style.color = "#6385C1";
			titleButton.style.fontWeight = "bold";
			titleButton.style.minWidth = "auto";
			titleButton.style.padding = "4px 8px";
			titleButton.style.margin = "0";
			titleButton.textContent = effect.name;

			//arrow icon
			const arrowSpan = document.createElement('span');
			arrowSpan.classList.add('arrow-icon');
			arrowSpan.innerHTML = '▶';
			arrowSpan.style.marginLeft = "auto";
			arrowSpan.style.fontSize = "12px";

			featureButton.appendChild(titleButton);
			featureButton.appendChild(arrowSpan);

			const effectDesc = document.createElement('div');
			effectDesc.classList.add('feature-description');
			effectDesc.style.display = 'none';

			// Add description
			const descText = typeof effect.description === 'string' ?
				effect.description.replace(/<[^>]*>/g, '') : "No description available";

			const descDiv = document.createElement('div');
			descDiv.style.marginTop = '5px';
			descDiv.textContent = descText;
			effectDesc.appendChild(descDiv);

			//click handlers
			titleButton.addEventListener('click', function (event) {
				event.stopPropagation();
				const message = `${effect.name}\n_______________\n${descText}`;
				sendDataToSidebar(message, characterData.Name);
			});

			featureButton.addEventListener('click', function (event) {
				if (event.target !== titleButton) {
					if (effectDesc.style.display === 'none') {
						effectDesc.style.display = 'block';
						arrowSpan.classList.add('arrow-down');
						arrowSpan.innerHTML = '▼';
					} else {
						effectDesc.style.display = 'none';
						arrowSpan.classList.remove('arrow-down');
						arrowSpan.innerHTML = '▶';
					}
				}
			});

			effectContainer.appendChild(featureButton);
			effectContainer.appendChild(effectDesc);
			effectContainer.appendChild(document.createElement('hr'));

			tempEffectsDiv.appendChild(effectContainer);
		});
	} else {
		tempEffectsDiv.innerHTML = '<p style="font-style: italic; color: #666; margin: 5px 0;">No temporary effects available.</p>';
	}

	// Add menu button event listeners
	const menuButtons = {
		'actions': () => showActions(adventureData),
		'bio': () => showBio(adventureData),
		'character': () => {
			characterSheetOverlay.remove();
			characterSheetOpen = false;
			createCharacterSheet(adventureData);
		},
		'features': () => showFeatures(adventureData),
		'inventory': () => showInventory(adventureData),
		'spells': () => showSpells(adventureData),
		'extras': () => showExtras(adventureData)
	};

	for (const [id, handler] of Object.entries(menuButtons)) {
		content.querySelector(`#${id}`).addEventListener('click', handler);
	}

	setupDiceRollHandlers();
}

function addSearchBar(container, itemSelector, searchFunction) {
	const searchContainer = document.createElement('div');
	searchContainer.classList.add('search-container');
	searchContainer.style.marginBottom = '10px';
	searchContainer.style.position = 'relative';
	searchContainer.style.backgroundColor = 'white';
	searchContainer.style.padding = '5px 0';
	searchContainer.style.zIndex = '10';

	const inputDiv = document.createElement('div');
	inputDiv.classList.add('input');
	inputDiv.style.position = 'relative';
	inputDiv.style.display = 'block';
	inputDiv.style.width = '100%';

	const searchInput = document.createElement('input');
	searchInput.type = 'text';
	searchInput.placeholder = 'Search...';
	searchInput.classList.add('search-input');

	searchInput.style.width = '100%';
	searchInput.style.padding = '5px';
	searchInput.style.border = '1px solid #ccc';
	searchInput.style.borderRadius = '4px';
	searchInput.style.boxSizing = 'border-box';
	searchInput.style.display = 'block';
	searchInput.style.position = 'static';
	searchInput.style.marginLeft = '10px';
	searchInput.style.marginRight = '0';
	searchInput.style.height = 'auto';

	searchInput.addEventListener('input', function () {
		const searchTerm = this.value.toLowerCase();
		const items = container.querySelectorAll(itemSelector);

		if (searchFunction) {
			searchFunction(items, searchTerm);
		} else {
			items.forEach(item => {
				const text = item.textContent.toLowerCase();
				if (text.includes(searchTerm)) {
					item.style.display = '';
				} else {
					item.style.display = 'none';
				}
			});
		}
	});

	// Put everything together
	inputDiv.appendChild(searchInput);
	searchContainer.appendChild(inputDiv);

	return searchContainer;
}


/*====================
= Helper functions  ==
====================*/
function fetchJsonDataFromUrl(url) {
	return new Promise((resolve, reject) => {
		fetch(url)
			.then(response => {
				if (!response.ok) {
					throw new Error('Network response was not ok');
				}
				return response.json();
			})
			.then(jsonData => {
				resolve(jsonData);
			})
			.catch(error => {
				reject(error);
			});
	});
}

function sendDataToSidebar(information, characterName) {
	if (information) {
		let plainText = information.replace(/<[^>]*>/g, '');

		plainText = plainText.replace(/\b(\d+)d(\d+)(?:([+-])(\d+))?\b/g, function (match) {
			return match;
		});

		information = plainText;
	}

	chrome.runtime.sendMessage({
		type: 'SEND_DATA_TO_SIDEBAR',
		information: information,
		characterName: characterName
	}, (response) => {
		if (chrome.runtime.lastError) {
			//console.error('Message sending error:', chrome.runtime.lastError);
		}
	});
}

function roll_dice(dice, event) {
	// Check if it's a d20 roll that can use advantage/disadvantage
	const isD20Roll = /^\s*1d20/i.test(dice);
	let rollType = DICE_ROLL_NORMAL;

	if (event && isD20Roll) {
		if (event.ctrlKey) {
			rollType = DICE_ROLL_ADVANTAGE;
		} else if (event.shiftKey) {
			rollType = DICE_ROLL_DISADVANTAGE;
		}
	}

	if (isD20Roll) {
		const modifier = dice.replace(/^\s*1d20\s*/, '');

		chrome.runtime.sendMessage({
			type: 'ROLL_D20',
			modifier: modifier,
			rollType: rollType
		}, (response) => {
		});
	} else {
		chrome.runtime.sendMessage({
			type: 'ROLL_DICE',
			dice: dice
		}, (response) => {
		});
	}
}


function convertSavingThrowText(text) {
	const savingThrowRegex = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw\b/gi;

	return text.replace(savingThrowRegex, function (match, ability) {
		return `<span class="saving-throw-link" data-ability="${ability.toLowerCase()}" style="color: #f08000; text-decoration: underline; cursor: pointer; font-weight: bold;">${match}</span>`;
	});
}

function convertDiceNotation(text) {
	const diceRegex = /\b(\d+)d(\d+)(?:([+-])(\d+))?\b/g;

	const textWithDice = text.replace(diceRegex, function (match, count, sides, operator, modifier) {
		return `<span class="dice-roll" data-dice="${match}" style="color: #f08000; text-decoration: underline; cursor: pointer; font-weight: bold;">${match}</span>`;
	});

	return convertSavingThrowText(textWithDice);
}

function removeHtmlTags(htmlString) {
	if (!htmlString) return "";

	try {
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = htmlString;

		// Find all paragraphs and create well-formatted text with proper line breaks
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
					formattedText += '• ' + element.textContent.trim() + '\n';
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

			return convertDiceNotation(formattedText);
		} else {
			let textContent = tempDiv.textContent || "";

			if (textContent.length > 80) {
				textContent = textContent.replace(/\.(\s+)/g, '.\n');
				textContent = textContent.replace(/\n{3,}/g, '\n\n');
			}

			const textWithDice = convertDiceNotation(formattedText);

			return convertSavingThrowText(textContent.trim());
		}
	} catch (e) {
		console.error('Error parsing HTML:', e);
		return convertDiceNotation(htmlString
			.replace(/<br\s*\/?>/gi, '\n')
			.replace(/<\/p>/gi, '\n\n')
			.replace(/<[^>]*>/g, '')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/\s+/g, ' ')
			.trim());
	}
}


function setupDiceRollHandlers() {
	document.querySelectorAll('.dice-roll').forEach(element => {
		element.addEventListener('click', function (event) {
			event.stopPropagation();
			const diceNotation = this.getAttribute('data-dice');
			roll_dice(diceNotation, event);
		});
	});

	document.querySelectorAll('.spell-attack').forEach(element => {
		element.addEventListener('click', function (event) {
			event.stopPropagation();

			// Get spell attack bonus from character data based on class
			let spellAttack;

			if (characterData.Classes[0].Definition.Name === "Sorcerer") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
			} else if (characterData.Classes[0].Definition.Name === "Wizard") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Intelligence;
			} else if (characterData.Classes[0].Definition.Name === "Cleric") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
			} else if (characterData.Classes[0].Definition.Name === "Druid") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
			} else if (characterData.Classes[0].Definition.Name === "Paladin") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
			} else if (characterData.Classes[0].Definition.Name === "Ranger") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
			} else if (characterData.Classes[0].Definition.Name === "Bard") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
			} else if (characterData.Classes[0].Definition.Name === "Warlock") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Charisma;
			} else if (characterData.Classes[0].Definition.Name === "Artificer") {
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Intelligence;
			} else {
				// Default to Wisdom if class not found
				spellAttack = characterData.ProficiencyBonus + characterData.AbilityScores.Modifier.Wisdom;
			}

			roll_dice(`1d20+${spellAttack}`, event);
		});
	});

	document.querySelectorAll('.saving-throw-link').forEach(element => {
		element.addEventListener('click', function (event) {
			event.stopPropagation();
			const ability = this.getAttribute('data-ability');

			let modifier = 0;
			if (characterData && characterData.SavingThrows && characterData.SavingThrows[ability.charAt(0).toUpperCase() + ability.slice(1)]) {
				modifier = characterData.SavingThrows[ability.charAt(0).toUpperCase() + ability.slice(1)].total;
			}

			roll_dice(`1d20+${modifier}`, event);
		});
	});
}

function applyInteractiveElements(container) {
	const textNodes = Array.from(container.querySelectorAll('p, div, span, label'))
		.filter(el => el.childNodes.length === 1 && el.childNodes[0].nodeType === Node.TEXT_NODE);

	textNodes.forEach(node => {
		const originalText = node.textContent;
		const processedText = convertDiceNotation(originalText);

		if (processedText !== originalText) {
			node.innerHTML = processedText;
		}
	});

	setupDiceRollHandlers();
}

function createProcessedDescription(descriptionText) {
	if (!descriptionText) return document.createElement('div');

	const descriptionElement = document.createElement('div');
	descriptionElement.style.whiteSpace = "pre-wrap";

	try {
		// First, handle bullet points with proper Unicode character conversion
		let processedText = descriptionText;

		// Apply saving throw links
		processedText = processedText.replace(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)\s+saving\s+throw\b/gi,
			match => `<span class="saving-throw-link" data-ability="$1" style="color: #f08000; text-decoration: underline; cursor: pointer; font-weight: bold;">${match}</span>`
		);

		// Apply spell attack links
		processedText = processedText.replace(/\b(Make a |make a )?(ranged|melee) spell attack\b/gi,
			match => `<span class="spell-attack" style="color: #f08000; text-decoration: underline; cursor: pointer; font-weight: bold;">${match}</span>`
		);

		// Set the HTML content with proper encoding
		descriptionElement.innerHTML = processedText;

		return descriptionElement;

	} catch (error) {
		console.error("Error processing description:", error);
		// Fallback to plain text if there's an error
		descriptionElement.textContent = descriptionText;
		return descriptionElement;
	}
}

//Used to get dice roll result from sidebar
function findLatestRoll(chatContainer) {
	const messages = chatContainer.querySelectorAll('p');
	for (let i = messages.length - 1; i >= 0; i--) {
		const message = messages[i];
		const rollPattern = /Dice roll: 1d\d+\+\d+\s*\[\d+\] \+ \d+ = (\d+)/;
		const match = message.textContent.match(rollPattern);
		if (match) {
			return match[1];
		}
	}
	return null;
}

function findHighestWarlockSpellLevel(characterData) {
	const warlockLevel = characterData.Classes[0].Level;

	if (warlockLevel >= 9) return 5;
	if (warlockLevel >= 7) return 4;
	if (warlockLevel >= 5) return 3;
	if (warlockLevel >= 3) return 2;
	return 1;
}

//check if a feature has limited use
function checkForLimitedUse(featureName) {
	if (!characterData || !characterData.Actions) return null;

	for (const key in characterData.Actions) {
		const action = characterData.Actions[key];

		if (action.Name === featureName &&
			action.LimitedUse &&
			action.LimitedUse.MaxUse) {

			return {
				maxUses: action.LimitedUse.MaxUse,
				usedCount: action.LimitedUse.NumberUsed || 0,
				resetType: action.LimitedUse.ResetType || "LongRest",
				actionKey: key
			};
		}
	}

	return null;
}

//tracker for limited usage features
function createUsageTracker(featureName, limitedUseData) {
	const container = document.createElement('div');
	container.classList.add('usage-tracker');
	container.style.display = 'flex';
	container.style.alignItems = 'center';
	container.style.marginLeft = '10px';

	// label showing uses
	const usesLabel = document.createElement('span');
	usesLabel.classList.add('uses-label');
	usesLabel.textContent = `${limitedUseData.usedCount}/${limitedUseData.maxUses}`;
	usesLabel.title = `Recharges on ${limitedUseData.resetType}`;
	usesLabel.style.fontSize = '12px';
	usesLabel.style.marginRight = '5px';

	// decrease button 
	const decreaseBtn = document.createElement('button');
	decreaseBtn.classList.add('skill-button-modification');
	decreaseBtn.textContent = '-';
	decreaseBtn.title = "Use feature";
	decreaseBtn.style.width = '20px';
	decreaseBtn.style.height = '20px';
	decreaseBtn.style.padding = '0';
	decreaseBtn.style.lineHeight = '1';
	decreaseBtn.style.marginRight = '2px';
	decreaseBtn.disabled = limitedUseData.usedCount <= 0;

	// increase button
	const increaseBtn = document.createElement('button');
	increaseBtn.classList.add('skill-button-modification');
	increaseBtn.textContent = '+';
	increaseBtn.title = "Recover use";
	increaseBtn.style.width = '20px';
	increaseBtn.style.height = '20px';
	increaseBtn.style.padding = '0';
	increaseBtn.style.lineHeight = '1';
	increaseBtn.disabled = limitedUseData.usedCount >= limitedUseData.maxUses;

	decreaseBtn.addEventListener('click', function (event) {
		event.stopPropagation();

		if (limitedUseData.usedCount > 0) {
			limitedUseData.usedCount--;
			usesLabel.textContent = `${limitedUseData.usedCount}/${limitedUseData.maxUses}`;
			decreaseBtn.disabled = limitedUseData.usedCount <= 0;
			increaseBtn.disabled = false;

			// Save to character data
			updateFeatureUsage(featureName, limitedUseData);
		}
	});

	increaseBtn.addEventListener('click', function (event) {
		event.stopPropagation(); 

		if (limitedUseData.usedCount < limitedUseData.maxUses) {
			limitedUseData.usedCount++;
			usesLabel.textContent = `${limitedUseData.usedCount}/${limitedUseData.maxUses}`;
			increaseBtn.disabled = limitedUseData.usedCount >= limitedUseData.maxUses;
			decreaseBtn.disabled = false;

			// Save to character data
			updateFeatureUsage(featureName, limitedUseData);
		}
	});

	container.appendChild(usesLabel);
	container.appendChild(decreaseBtn);
	container.appendChild(increaseBtn);

	return container;
}

function updateFeatureUsage(featureName, limitedUseData) {
	if (!characterData || !characterData.Actions) return;

	const actionKey = limitedUseData.actionKey;
	if (characterData.Actions[actionKey]) {
		characterData.Actions[actionKey].LimitedUse.NumberUsed = limitedUseData.usedCount;

		chrome.storage.local.set({ 'characterData': characterData }, function () {
			chrome.storage.local.get(['activeCharacterId', 'characters'], function (result) {
				if (result.activeCharacterId && result.characters &&
					result.characters[result.activeCharacterId]) {

					if (result.characters[result.activeCharacterId].Actions &&
						result.characters[result.activeCharacterId].Actions[actionKey]) {

						result.characters[result.activeCharacterId].Actions[actionKey].LimitedUse.NumberUsed =
							limitedUseData.usedCount;

						chrome.storage.local.set({ 'characters': result.characters });
					}
				}
			});
		});
	}
}