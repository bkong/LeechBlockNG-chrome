/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const browser = chrome;

function log(message) { console.log("[LBNG] " + message); }
function warn(message) { console.warn("[LBNG] " + message); }

function getElement(id) { return document.getElementById(id); }

var gAccessConfirmed = false;
var gAccessRequiredInput;
var gClockOffset;
var gOverrideConfirm;
var gOverrideMins;

// Initialize form
//
function initForm() {
	//log("initForm");

	// Set up JQuery UI widgets
	$("#activate").button();
	$("#activate").click(activateOverride);
	$("#cancel").button();
	$("#cancel").click(closePage);
}

// Initialize page
//
function initializePage() {
	//log("initializePage");

	browser.storage.local.get("sync", onGotSync);

	function onGotSync(options) {
		if (browser.runtime.lastError) {
			warn("Cannot get options: " + browser.runtime.lastError.message);
			$("#alertRetrieveError").dialog("open");
			return;
		}

		if (options["sync"]) {
			browser.storage.sync.get(onGot);
		} else {
			browser.storage.local.get(onGot);
		}
	}

	function onGot(options) {
		if (browser.runtime.lastError) {
			warn("Cannot get options: " + browser.runtime.lastError.message);
			$("#alertRetrieveError").dialog("open");
			return;
		}

		cleanOptions(options);

		// Initialize form
		initForm();

		setTheme(options["theme"]);

		gClockOffset = options["clockOffset"];

		gOverrideConfirm = options["orc"];
		gOverrideMins = options["orm"];

		confirmAccess(options);
	}
}

// Close page
//
function closePage() {
	// Request tab close
	browser.runtime.sendMessage({ type: "close" });
}

// Confirm access to override
//
function confirmAccess(options) {
	let ora = options["ora"];
	let orp = options["orp"];
	let code = options["orcode"];
	let password = options["password"];
	let hpp = options["hpp"];

	if (ora == 1 && password) {
		gAccessRequiredInput = password;
		if (hpp) {
			$("#promptPasswordInput").attr("type", "password");
		} else {
			$("#promptPasswordInput").attr("type", "text");
		}
		$("#promptPasswordInput").val("");
		$("#promptPassword").dialog("open");
		$("#promptPasswordInput").focus();
	} else if (ora == 8 && code) {
		gAccessRequiredInput = code;
		displayAccessCode(code, options["accessCodeImage"]);
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else if (ora == 9 && orp) {
		gAccessRequiredInput = orp;
		$("#promptPasswordInput").attr("type", "password");
		$("#promptPasswordInput").val("");
		$("#promptPassword").dialog("open");
		$("#promptPasswordInput").focus();
	} else if (ora >= 2 && ora <= 4) {
		let code = createAccessCode(32);
		if (ora > 2) {
			code += createAccessCode(32);
		}
		if (ora > 3) {
			code += createAccessCode(64);
		}
		gAccessRequiredInput = code;
		displayAccessCode(code, options["accessCodeImage"]);
		$("#promptAccessCodeInput").val("");
		$("#promptAccessCode").dialog("open");
		$("#promptAccessCodeInput").focus();
	} else if (gOverrideMins) {
		// Override duration already specified in General options
		activateOverride();
	} else {
		// Override duration not specified in General options
		$("#form").show();
	}
}

// Display access code (as text or image)
//
function displayAccessCode(code, asImage) {
	let codeText = getElement("promptAccessCodeText");
	let codeImage = getElement("promptAccessCodeImage");
	let codeCanvas = getElement("promptAccessCodeCanvas");

	let lines = [];
	let idx = 0;
	do {
		let spaceIdx = (idx + 64 >= code.length) ? code.length : code.lastIndexOf(" ", idx + 64);
		if (spaceIdx == -1) {
			lines.push(code.substring(idx, idx + 64));
			idx += 64;
		} else {
			lines.push(code.substring(idx, spaceIdx));
			idx = spaceIdx + 1;
		}
	} while (idx < code.length - 1);

	if (asImage) {
		// Display code as image
		codeText.style.display = "none";
		codeImage.style.display = "";
		let ctx = codeCanvas.getContext("2d");
		ctx.font = "normal 14px monospace";
		let width = ctx.measureText(code.substring(0, 64)).width + 8;
		let height = lines.length * 16 + 8;
		codeCanvas.width = width * devicePixelRatio;
		codeCanvas.height = height * devicePixelRatio;
		ctx.scale(devicePixelRatio, devicePixelRatio);
		codeCanvas.style.width = width + 'px';
		codeCanvas.style.height = height + 'px';
		ctx.font = "normal 14px monospace"; // resizing canvas resets font!
		ctx.fillStyle = "#000";
		for (let i = 0; i < lines.length; i++) {
			ctx.fillText(lines[i], 4, 16 * (i+1));
		}
	} else {
		// Display code as text
		codeText.style.display = "";
		codeImage.style.display = "none";
		for (let i = 0; i < lines.length; i++) {
			codeText.appendChild(document.createTextNode(lines[i]));
			codeText.appendChild(document.createElement("br"));
		}
	}
}

// Activate override
//
function activateOverride() {
	// Get duration from form if not already specified
	if (!gOverrideMins) {
		gOverrideMins = $("#mins").val();
		if (!gOverrideMins || !checkPosIntFormat(gOverrideMins)) {
			gOverrideMins = "";
			$("#mins").val("");
			$("#alertNoDuration").dialog("open");
			return;
		}
	}

	// Calculate end time for override
	let endTime = Math.floor(Date.now() / 1000) + (gClockOffset * 60) + (gOverrideMins * 60);

	// Request override
	let message = {
		type: "override",
		endTime: endTime
	};
	browser.runtime.sendMessage(message);

	if (gOverrideConfirm) {
		// Show confirmation dialog
		endTime = new Date(endTime * 1000);
		$("#alertOverrideEndTime").html(endTime.toLocaleTimeString());
		$("#alertOverrideActivated").dialog("open");
	} else {
		// Close page immediately (no confirmation dialog)
		closePage();
	}
}

// Initialize access control prompt
//
function initAccessControlPrompt(prompt) {
	// Create functions for buttons
	let dialogButtons = {
		OK: function () {
			let input = $(`#${prompt}Input`);
			if (input.val() == gAccessRequiredInput) {
				gAccessConfirmed = true;
				if (gOverrideMins) {
					activateOverride();
				} else {
					$("#form").show();
				}
				$(`#${prompt}`).dialog("close");
			} else {
				input.val("");
				input.effect({ effect: "highlight", color: "#ff0000" });
				input.focus();
			}
		},
		Cancel: function () {
			$(`#${prompt}`).dialog("close");
		}
	};

	// Initialize prompt dialog
	$(`#${prompt}`).dialog({
		autoOpen: false,
		modal: true,
		width: 600,
		buttons: dialogButtons,
		close: function (event, ui) { if (!gAccessConfirmed) closePage(); }
	});

	// Connect ENTER key to OK button
	$(`#${prompt}Input`).keydown(
		function (event) {
			if (event.which == 13) {
				dialogButtons.OK();
			}
		}
	);
}

/*** STARTUP CODE BEGINS HERE ***/

// Initialize alert dialogs
$("div[id^='alert']").dialog({
	autoOpen: false,
	modal: true,
	width: 500,
	buttons: {
		OK: function () { $(this).dialog("close"); }
	}
});
$("#alertOverrideActivated").dialog({
	close: function (event, ui) { closePage(); }
});

// Initialize access control prompts
initAccessControlPrompt("promptPassword");
initAccessControlPrompt("promptAccessCode");

document.addEventListener("DOMContentLoaded", initializePage);
