import { MODULENAME } from "./utils.mjs";
import { PredefinedSheets } from "./predefined-sheets.mjs";
import { SpritesheetGenerator } from "./spritesheets.mjs";

/**
 * Add the spritesheet settings to the token config page
 * @param {*} config 
 * @param {*} html 
 * @param {*} context 
 */
async function OnRenderTokenConfig(config, html, context) {
  const form = $(html).find("form").get(0) ?? config.form;
  const token = config.token;

  const allowTokenArtPastBounds = game.settings.get(MODULENAME, "allowTokenArtPastBounds");

  // Two-field approach: keep two file-pickers as stable DOM elements.
  // We use data attributes to find them regardless of their current name/disabled state,
  // since an inactive picker has its name attribute removed so Foundry doesn't serialize it.
  let srcPickerEl = form.querySelector("[name='texture.src']") ?? form.querySelector("[data-dat-picker='texture-src']");
  if (srcPickerEl && !srcPickerEl.dataset.datPicker) srcPickerEl.dataset.datPicker = "texture-src";

  let sheetsrcPickerEl = form.querySelector(`[name='flags.${MODULENAME}.sheetsrc']`) ?? form.querySelector("[data-dat-picker='sheetsrc']");

  // Create the sheetsrc picker on first render by cloning the texture.src picker
  if (!sheetsrcPickerEl && srcPickerEl) {
    sheetsrcPickerEl = srcPickerEl.cloneNode(true);
    sheetsrcPickerEl.removeAttribute("id"); // don't duplicate ID
    sheetsrcPickerEl.name = `flags.${MODULENAME}.sheetsrc`;
    sheetsrcPickerEl.dataset.datPicker = "sheetsrc";
    srcPickerEl.insertAdjacentElement("afterend", sheetsrcPickerEl);
    srcPickerEl.parentElement.classList.add("token-config-src-picker");
    sheetsrcPickerEl.value = token.getFlag(MODULENAME, "sheetsrc") ?? token.texture?.src ?? "";
  }

  // checkbox for whether or not this should be a spritesheet!
  let checkboxEl = form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`);
  if (!checkboxEl) {
    const srcFieldForCheckbox = $(form).find(`.token-config-src-picker file-picker`).first();
    srcFieldForCheckbox.before(`<label>Sheet</label><input type="checkbox" name="flags.${MODULENAME}.spritesheet" ${token.getFlag(MODULENAME, "spritesheet") ? "checked" : ""}>`);
    checkboxEl = form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`);
  };

  /**
   * Recalculate all the computed fields, create them if they don't exist, and update them.
   */
  const refreshConfig = async function ({ updateScale } = { updateScale: true }) {
    const src = PredefinedSheets.cleanSrc(
      sheetsrcPickerEl?.querySelector("input[type='text']")?.value ?? sheetsrcPickerEl?.value ?? ""
    );
    const predefinedSheetSettings = PredefinedSheets.getSheetSettings(src);
    const isPredefined = predefinedSheetSettings !== undefined;

    if (checkboxEl.checked) {
      // disable srcPickerEl and enable sheetsrcPickerEl
      srcPickerEl.disabled = true;
      srcPickerEl.style.display = "none";
      const srcInput = srcPickerEl.querySelector("input[type='text']");
      if (srcInput) srcInput.disabled = true;
      
      sheetsrcPickerEl.disabled = false;
      sheetsrcPickerEl.style.display = "";
      const sheetsrcInput = sheetsrcPickerEl.querySelector("input[type='text']");
      if (sheetsrcInput) sheetsrcInput.disabled = false;
    } else {
      // enable srcPickerEl and disable sheetsrcPickerEl
      srcPickerEl.disabled = false;
      srcPickerEl.style.display = "";
      const srcInput = srcPickerEl.querySelector("input[type='text']");
      if (srcInput) srcInput.disabled = false;

      sheetsrcPickerEl.disabled = true;
      sheetsrcPickerEl.style.display = "none";
      const sheetsrcInput = sheetsrcPickerEl.querySelector("input[type='text']");
      if (sheetsrcInput) sheetsrcInput.disabled = true;
    }

    function getHiddenBoolOrFlag(flagName, defaultValue) {
      const hiddenField = form.querySelector(`input[name='flags.${MODULENAME}.${flagName}']`);
      if (hiddenField?.checked !== undefined) {
        return hiddenField.checked;
      }
      return token.getFlag(MODULENAME, flagName) ?? defaultValue;
    }

    const data = {
      spritesheet: checkboxEl.checked,
      sheetstyle: form.querySelector(`select[name='flags.${MODULENAME}.sheetstyle']`)?.value ?? token.getFlag(MODULENAME, "sheetstyle") ?? "dlru",
      animationframes: (parseInt(form.querySelector(`input[name='flags.${MODULENAME}.animationframes']`)?.value) || token.getFlag(MODULENAME, "animationframes")) ?? 4,
      separateidle: form.querySelector(`input[name='flags.${MODULENAME}.separateidle']`)?.checked ?? token.getFlag(MODULENAME, "separateidle") ?? false,
      noidle: form.querySelector(`input[name='flags.${MODULENAME}.noidle']`)?.checked ?? token.getFlag(MODULENAME, "noidle") ?? false,
      unlockedanchor: getHiddenBoolOrFlag("unlockedanchor", false),
      unlockedfit: getHiddenBoolOrFlag("unlockedfit", false),
      ...(predefinedSheetSettings ?? {}),
      MODULENAME,
    };
    
    // Convert aliased sheet styles to their canonical equivalents
    let SHEET_STYLE = SpritesheetGenerator.SHEET_STYLES[data.sheetstyle];
    if (SHEET_STYLE?.alias) {
      data.sheetstyle = SHEET_STYLE.alias;
      SHEET_STYLE = SpritesheetGenerator.SHEET_STYLES[data.sheetstyle];
    }
    
    if (SHEET_STYLE?.frames !== undefined) {
      data.animationframes = SHEET_STYLE.frames;
    }

    // Populate the dropdown for the types of spritesheet layouts available (exclude aliases)
    data.sheetStyleOptions = Object.entries(SpritesheetGenerator.SHEET_STYLES)
      .filter(([val, option]) => !option.alias) // Filter out aliased entries
      .reduce((allOptions, [val, option])=>{
        return allOptions + `<option value="${val}" ${data.sheetstyle === val ? "selected" : ""}>${game.i18n.localize(option.label)}</option>`;
      }, "");

    // locks for "unlockedanchor" and "unlockedfit"
    for (const [tf,tfInput] of Object.entries({
      "fit": new foundry.data.fields.StringField({ label: "Fit", choices: ()=>({"fill": "Fill", "contain": "Contain", "cover": "Cover", "width": "Width", "height": "Height"}) }),
      "anchorX": new foundry.data.fields.NumberField({ label: "Anchor X" }),
      "anchorY": new foundry.data.fields.NumberField({ label: "Anchor Y" })
    })) {
      if (!form.querySelector(`[name='texture.${tf}']`)) {
        // place to put it
        let spot = $(form).find("fieldset.size");
        if (!spot.length) spot = $(form);
        $(spot).append(`<div class="form-group ${tf}"><label>${tfInput.label}</label><div class="form-fields">${tfInput.toInput({ name: "texture." + tf, value: token?.texture?.[tf] }).outerHTML}</div></div>`);
      }
    }

    if (allowTokenArtPastBounds) {
      // Add hidden fields for unlockedanchor and unlockedfit flags
      if (!form.querySelector(`input[name='flags.${MODULENAME}.unlockedanchor']`)) {
        $(form).append(`<input type="checkbox" style="display:none" name="flags.${MODULENAME}.unlockedanchor" ${data.unlockedanchor ? "checked" : ""} />`);
      }
      if (!form.querySelector(`input[name='flags.${MODULENAME}.unlockedfit']`)) {
        $(form).append(`<input type="checkbox" style="display:none" name="flags.${MODULENAME}.unlockedfit" ${data.unlockedfit ? "checked" : ""} />`);
      }

      $(form).find(".toggle-link-anchor-to-sheet").remove();
      const unlockedAnchorLink = $(`<a class="toggle-link-anchor-to-sheet" title="${data.unlockedanchor ? "Base Anchors on Sheet" : "Manual Anchors"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedanchor ? "fa-lock-open" : "fa-lock"}"></i></a>`);
      $(form).find('[name="texture.anchorX"]').closest('.form-group').find('> label').append(unlockedAnchorLink);
      $(unlockedAnchorLink).on("click", ()=>{
        const hiddenField = form.querySelector(`input[name='flags.${MODULENAME}.unlockedanchor']`);
        hiddenField.checked = !hiddenField.checked;
        refreshConfig();
      });
      $(form).find('[name="texture.anchorX"]').prop("readonly", !data.unlockedanchor);
      $(form).find('[name="texture.anchorY"]').prop("readonly", !data.unlockedanchor);

      $(form).find(".toggle-link-fit-to-sheet").remove();
      const unlockedFitLink = $(`<a class="toggle-link-fit-to-sheet" title="${data.unlockedfit ? "Base Fit on Sheet" : "Manual Fit"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedfit ? "fa-lock-open" : "fa-lock"}"></i></a>`);
      $(form).find('[name="texture.fit"]').closest('.form-group').find('> label').append(unlockedFitLink);
      $(unlockedFitLink).on("click", ()=>{
        const hiddenField = form.querySelector(`input[name='flags.${MODULENAME}.unlockedfit']`);
        hiddenField.checked = !hiddenField.checked;
        refreshConfig();
      });
      $(form).find('[name="texture.fit"]').prop("readonly", !data.unlockedfit);
    }

    // additional spritesheet-specific configurations
    data.showframes = SHEET_STYLE?.frames === undefined;
    data.showidle = game.settings.get(MODULENAME, "playIdleAnimations") && !data.separateidle;
    data.hide = !data.spritesheet || isPredefined;
    data.hideaux = !data.spritesheet;
    const rendered = $(await foundry.applications.handlebars.renderTemplate(`modules/${MODULENAME}/templates/token-settings.hbs`, data)).get(0);
    if (!form.querySelector(".spritesheet-config")) {
      $(form).find(`[name='flags.${MODULENAME}.sheetsrc'], [name='texture.src']`).first().closest(".form-group").after(`<div class="spritesheet-config"></div>`)
    };
    form.querySelector(".spritesheet-config-aux")?.remove();
    form.querySelector(".spritesheet-config").replaceWith(rendered);

    // If token art past bounds is disallowed, don't do this
    if (!allowTokenArtPastBounds) return;

    // check that the anchoring fields exist
    for (const tf of ["fit", "anchorX", "anchorY"]) {
      if (!form.querySelector(`[name='texture.${tf}']`)) {
        $(form).append(`<input name="texture.${tf}" value="${token?.texture?.[tf]}" hidden />`);
      }
    }

    // update the anchors
    if (!data.spritesheet) {
      // reset the anchors if they exist
      if (!data.unlockedfit) form.querySelector("[name='texture.fit']").value = "contain";
      if (!data.unlockedanchor) {
        form.querySelector("[name='texture.anchorX']").value = 0.5;
        form.querySelector("[name='texture.anchorY']").value = 0.5;
      }
      return;
    } else {
      // create a hidden field to disable autoscaling for certain systems
      switch (game.system.id) {
        case "ptu":
          if (!form.querySelector("input[name='flags.ptu.autoscale']")) {
            $(form).append(`<input name="flags.ptu.autoscale" type="checkbox" style="display:none" />`);
          }
          break;
        case "ptr2e":
          if (!form.querySelector("input[name='flags.ptr2e.autoscale']")) {
            $(form).append(`<input name="flags.ptr2e.autoscale" type="checkbox" style="display:none" />`);
          }
          break;
      }
    };

    const scaleFormEl = form.querySelector("range-picker[name='scale'], input[name='scale']");
    if (updateScale && !!scaleFormEl && data.scale !== undefined) {
      scaleFormEl.value = data.scale;
      const scaleFormLabel = $(scaleFormEl).next();
      if (scaleFormLabel.is(".range-value")) {
        scaleFormLabel.text(`${data.scale}`);
      }
    }

    const texture = await foundry.canvas.loadTexture(src, {fallback: CONST.DEFAULT_TOKEN});
    if (!texture) return;
    const { width, height } = texture ?? {};
    if (!width || !height) return;
    const defaultRatio = SHEET_STYLE?.defaultRatio ?? (4 / data.animationframes);

    const ratio = (height / width) * defaultRatio;
    const scale = form.querySelector("range-picker[name='scale'], input[name='scale']")?.value ?? 1;
    const anchorY = (()=>{
      if (predefinedSheetSettings?.anchor) return predefinedSheetSettings.anchor;
      switch (data.sheetstyle) {
        case "pmd":
        case "eight": return 0.5;
        default: return 1.02 + (0.5 / (-ratio * scale));
      }
    })();

    // set the anchoring fields
    if (data.spritesheet && !data.unlockedfit) form.querySelector("[name='texture.fit']").value = "width";
    if (data.spritesheet && !data.unlockedanchor) {
      form.querySelector("[name='texture.anchorX']").value = 0.5;
      form.querySelector("[name='texture.anchorY']").value = Math.ceil(100 * anchorY) / 100;
    }
  };

  await refreshConfig();

  //
  // listeners
  //

  const listenToFilepicker = function(pickerName, cb) {
    $(form).on("change", `[name='${pickerName}'] input[type='text'], input[name='${pickerName}'][type='text']`, cb);
    // dumb workaround to listen on the filepicker button too
    $(form).on("click", `[name='${pickerName}'] button`, function () {
      const filePicker = $(this).closest("file-picker")?.get(0)?.picker;
      if (!filePicker) return;
      filePicker.callback = ((callback)=>{
        return function () {
          if (callback) callback(...arguments);
          cb();
        }
      })(filePicker.callback);
    })
  };

  listenToFilepicker("texture.src", function () {
    // figure out if the new src has a predefined sheet associated with it, and if so,
    // toggle the spritesheet checkbox on and off to trigger the rest of the settings
    // to update accordingly
    const src = PredefinedSheets.cleanSrc(
      srcPickerEl?.querySelector("input[type='text']")?.value ?? srcPickerEl?.value ?? ""
    );
    const hasPredefinedSheet = PredefinedSheets.getSheetSettings(src) !== undefined;
    if (hasPredefinedSheet && !checkboxEl.checked) {
      checkboxEl.checked = true;
      sheetsrcPickerEl.value = src;
    }
    refreshConfig();
  });
  listenToFilepicker(`flags.${MODULENAME}.sheetsrc`, refreshConfig);


  // listen for the "spritesheet" toggle
  $(form).on("change", `[name='flags.${MODULENAME}.spritesheet']`, refreshConfig);

  $(form).on("change", `[name='flags.${MODULENAME}.sheetstyle']`, refreshConfig);

  $(form).on("change", `[name='flags.${MODULENAME}.animationframes']`, refreshConfig);

  // listen for the "scale" value
  $(form).on("change", "[name='scale']", ()=>refreshConfig({updateScale: false}));
}


export function register() {
  Hooks.on("renderTokenConfig", OnRenderTokenConfig);
  Hooks.on("renderPrototypeTokenConfig", OnRenderTokenConfig);
}