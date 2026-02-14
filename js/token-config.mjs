import { MODULENAME } from "./utils.mjs";
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

  /**
   * Recalculate all the computed fields, create them if they don't exist, and update them.
   */
  const refreshConfig = async function ({ updateScale } = { updateScale: true }) {
    const rawSrc = form.querySelector("[name='texture.src'] input[type='text']")?.value ?? form.querySelector("[name='texture.src'][type='text']")?.value;
    const src = (()=>{
      if (rawSrc.startsWith(`modules/${MODULENAME}/img`)) return rawSrc;
      if (rawSrc.includes(`modules/${MODULENAME}/img`)) {
        return rawSrc.substring(rawSrc.indexOf(`modules/${MODULENAME}/img`));
      }
      return rawSrc;
    })();
    const predefinedSheetSettings = undefined;
    const isPredefined = predefinedSheetSettings !== undefined;

    const data = {
      spritesheet: isPredefined || (form.querySelector(`input[name='flags.${MODULENAME}.spritesheet']`)?.checked ?? token.getFlag(MODULENAME, "spritesheet")),
      sheetstyle: form.querySelector(`select[name='flags.${MODULENAME}.sheetstyle']`)?.value ?? token.getFlag(MODULENAME, "sheetstyle") ?? "dlru",
      animationframes: (parseInt(form.querySelector(`input[name='flags.${MODULENAME}.animationframes']`)?.value) || token.getFlag(MODULENAME, "animationframes")) ?? 4,
      separateidle: form.querySelector(`input[name='flags.${MODULENAME}.separateidle']`)?.checked ?? token.getFlag(MODULENAME, "separateidle") ?? false,
      noidle: form.querySelector(`input[name='flags.${MODULENAME}.noidle']`)?.checked ?? token.getFlag(MODULENAME, "noidle") ?? false,
      unlockedanchor: token.getFlag(MODULENAME, "unlockedanchor") ?? false,
      unlockedfit: token.getFlag(MODULENAME, "unlockedfit") ?? false,
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

    // checkbox for whether or not this should be a spritesheet!
    if (!form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`)) {
      $(form).find("[name='texture.src']").before(`<label>Sheet</label><input type="checkbox" name="flags.${MODULENAME}.spritesheet" ${data.spritesheet ? "checked" : ""}>`);
    };
    form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`).checked = data.spritesheet;
    form.querySelector(`[name='flags.${MODULENAME}.spritesheet']`).readonly = isPredefined;

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

    $(form).find(".toggle-link-anchor-to-sheet").remove();
    const unlockedAnchorLink = $(`<a class="toggle-link-anchor-to-sheet" title="${data.unlockedanchor ? "Base Anchors on Sheet" : "Manual Anchors"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedanchor ? "fa-lock-open" : "fa-lock"}"></i></a>`);
    $(form).find('[name="texture.anchorX"]').closest('.form-group').find('> label').append(unlockedAnchorLink);
    $(unlockedAnchorLink).on("click", ()=>{
      token.setFlag(MODULENAME, "unlockedanchor", !data.unlockedanchor);
    });
    if (!data.unlockedanchor) {
      $(form).find('[name="texture.anchorX"]').prop("readonly", true);
      $(form).find('[name="texture.anchorY"]').prop("readonly", true);
    }

    $(form).find(".toggle-link-fit-to-sheet").remove();
    const unlockedFitLink = $(`<a class="toggle-link-fit-to-sheet" title="${data.unlockedfit ? "Base Fit on Sheet" : "Manual Fit"}" style="margin-left: 0.3em;"><i class="fa-solid fa-fw ${data.unlockedfit ? "fa-lock-open" : "fa-lock"}"></i></a>`);
    $(form).find('[name="texture.fit"]').closest('.form-group').find('> label').append(unlockedFitLink);
    $(unlockedFitLink).on("click", ()=>{
      token.setFlag(MODULENAME, "unlockedfit", !data.unlockedfit);
    });
    if (!data.unlockedfit) {
      $(form).find('[name="texture.fit"]').prop("readonly", true);
    }

    // additional spritesheet-specific configurations
    data.showframes = SHEET_STYLE?.frames === undefined;
    data.showidle = game.settings.get(MODULENAME, "playIdleAnimations") && !data.separateidle;
    data.hide = !data.spritesheet || isPredefined;
    data.hideaux = !data.spritesheet;
    const rendered = $(await foundry.applications.handlebars.renderTemplate(`modules/${MODULENAME}/templates/token-settings.hbs`, data)).get(0);
    if (!form.querySelector(".spritesheet-config")) {
      $(form).find("[name='texture.src']").closest(".form-group").after(`<div class="spritesheet-config"></div>`)
    };
    form.querySelector(".spritesheet-config-aux")?.remove();
    form.querySelector(".spritesheet-config").replaceWith(rendered);

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
      switch (game.system.id) {
        case "ptu":
          if (token?.flags?.ptu?.autoscale) {
            await token.setFlag("ptu", "autoscale", false).then(()=>refreshConfig({ updateScale }));
            return;
          }
          break;
        case "ptr2e":
          if (token?.flags?.ptr2e?.autoscale) {
            await token.setFlag("ptr2e", "autoscale", false).then(()=>refreshConfig({ updateScale }));
            return;
          }
          break;
      }
    };

    const scaleFormEl = form.querySelector("range-picker[name='scale'], input[name='scale']");
    if (updateScale && !!scaleFormEl) {
      scaleFormEl.value = data.scale ?? 1;
      const scaleFormLabel = $(scaleFormEl).next();
      if (scaleFormLabel.is(".range-value")) {
        scaleFormLabel.text(`${data.scale ?? 1}`);
      }
    }

    const texture = await foundry.canvas.loadTexture(src, {fallback: CONST.DEFAULT_TOKEN});
    const { width, height } = texture ?? {};
    if (!width || !height) return;
    const defaultRatio = SHEET_STYLE?.defaultRatio ?? (4 / data.animationframes);

    const ratio = (height / width) * defaultRatio;
    const scale = form.querySelector("range-picker[name='scale'], input[name='scale']")?.value ?? 1;
    const anchorY = (()=>{
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

  $(form).on("change", "[name='texture.src'] input[type='text'], input[name='texture.src'][type='text']", refreshConfig);
  // dumb workaround to listen on the filepicker button too
  $(form).on("click", "[name='texture.src'] button", function () {
    const filePicker = $(this).closest("file-picker")?.get(0)?.picker;
    if (!filePicker) return;
    filePicker.callback = ((callback)=>{
      return function () {
        if (callback) callback(...arguments);
        refreshConfig();
      }
    })(filePicker.callback);
  })

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