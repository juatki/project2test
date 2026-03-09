
// Create Cesium Viewer
const viewer = new Cesium.Viewer("cesiumContainer", {
    imageryProvider: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    animation: false,
    timeline: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false
});
// jdfshdgoiushgoh
// Globe appearance
viewer.imageryLayers.removeAll();
viewer.scene.globe.baseColor = Cesium.Color.WHITE;
viewer.scene.backgroundColor = Cesium.Color.WHITE;
viewer.scene.globe.enableLighting = false;
viewer.scene.globe.showGroundAtmosphere = false;
viewer.scene.skyAtmosphere.show = false;
viewer.scene.skyBox.show = false;
viewer.scene.fog.enabled = false;
viewer.scene.sun.show = false;
viewer.scene.moon.show = false;

viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(20, 20, 20000000)
});

viewer.scene.postProcessStages.add(Cesium.PostProcessStageLibrary.createSilhouetteStage());

// Helpers
function rebuildPolygon(entity) {
    const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
    return new Cesium.PolygonHierarchy(hierarchy.positions, hierarchy.holes);
}

function getPolygonCenter(entity) {
    const hierarchy = entity.polygon.hierarchy.getValue(Cesium.JulianDate.now());
    const boundingSphere = Cesium.BoundingSphere.fromPoints(hierarchy.positions);
    return boundingSphere.center;
}

function toTitleCase(str) {
    return str.replace(/\b\w/g, l => l.toUpperCase());
}

// State
let backgroundDataSource;
let fillDataSource;
let countryIndex = {};
let countryNames = [];
let selectedCountry = null;
let selectedLabel = null;
let targetCountry = null;
let currentClueIndex = 0;
let targetCountryInfo = {};
const countryInfoCache = {};

Cesium.GeoJsonDataSource.load("worldcountriesfill.geojson", { clampToGround: true }).then(ds => {

    fillDataSource = ds;
    viewer.dataSources.add(ds);

    ds.entities.values.forEach(entity => {

        if (!entity.polygon) return;

        entity.polygon.hierarchy = rebuildPolygon(entity);
        entity.polygon.arcType = Cesium.ArcType.GEODESIC;
        entity.polygon.material = Cesium.Color.fromCssColorString("#000000ff").withAlpha(1);
        entity.polygon.outline = false;

        const countryName = entity.properties.name.getValue();

        if (!countryIndex[countryName]) {
            countryIndex[countryName] = [];
            countryNames.push(countryName);
        }

        countryIndex[countryName].push(entity);
    });

    startCountryChallenge();
});

// Start a new country challenge
function startCountryChallenge() {
    if (countryNames.length === 0) return;

    currentClueIndex = 0;
    const randomIndex = Math.floor(Math.random() * countryNames.length);
    targetCountry = countryNames[randomIndex];

    const entity = countryIndex[targetCountry][0];
    const wikidataID = entity.properties.wikidata_id.getValue();

    fetchCountryData(wikidataID).then(info => {
        targetCountryInfo = info;
        showNextClue();
    });
}

Cesium.GeoJsonDataSource.load("worldborders.geojson", { clampToGround: true }).then(ds => {

    viewer.dataSources.add(ds);

    ds.entities.values.forEach(entity => {

        if (!entity.polyline) return;

        entity.polyline.width = 4;
        entity.polyline.material = Cesium.Color.BLACK;
        entity.polyline.clampToGround = true;

    });

});


// Show the next clue
function showNextClue() {
    const banner = document.getElementById("countryChallenge");
    const clues = [
        `Population: ${targetCountryInfo.population}`,
        `Capital: ${targetCountryInfo.capital}`,
        `Currency: ${targetCountryInfo.currency}`,
        `Languages: ${targetCountryInfo.languages}`
    ];

    if (currentClueIndex < clues.length) {
        banner.textContent = clues[currentClueIndex];
    } else {
        banner.textContent = `The country was: ${targetCountry}. Refresh to try again!`;
    }
}

// Fetch country data from Wikidata
async function fetchCountryData(wikidataID) {
    if (countryInfoCache[wikidataID]) return countryInfoCache[wikidataID];

    const query = `
        SELECT ?population ?currencyLabel ?capitalLabel ?languageLabel WHERE {
            OPTIONAL { wd:${wikidataID} wdt:P1082 ?population. }
            OPTIONAL { wd:${wikidataID} wdt:P38 ?currency. }
            OPTIONAL { wd:${wikidataID} wdt:P36 ?capital. }
            OPTIONAL { wd:${wikidataID} wdt:P2936 ?language. }  # Correct property for official languages
            SERVICE wikibase:label { bd:serviceParam wikibase:language "[AUTO_LANGUAGE],en". }
        }
    `;

    const url = "https://query.wikidata.org/sparql?query=" + encodeURIComponent(query);

    try {
        const response = await fetch(url, { headers: { 'Accept': 'application/sparql-results+json' } });
        const data = await response.json();

        // There may be multiple rows if multiple languages exist
        const languages = data.results.bindings
            .map(r => r.languageLabel ? r.languageLabel.value : null)
            .filter(Boolean);

        // Take unique languages and join them
        const languageStr = [...new Set(languages)].join(", ") || "Unknown";

        const row = data.results.bindings[0] || {};

        const result = {
            population: row.population ? Number(row.population.value).toLocaleString() : "Unknown",
            currency: row.currencyLabel ? toTitleCase(row.currencyLabel.value) : "Unknown",
            capital: row.capitalLabel ? row.capitalLabel.value : "Unknown",
            languages: languageStr
        };

        countryInfoCache[wikidataID] = result;
        return result;
    } catch (err) {
        console.error("Wikidata fetch error:", err);
        return { population: "Unknown", currency: "Unknown", capital: "Unknown", languages: "Unknown" };
    }
}

// Click handler
const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
handler.setInputAction(click => {
    const picked = viewer.scene.pick(click.position);
    if (!Cesium.defined(picked)) return;

    const entity = picked.id;
    if (!fillDataSource || !fillDataSource.entities.contains(entity)) return;

    const countryName = entity.properties.name.getValue();
    const banner = document.getElementById("countryChallenge");

    // Reset previous selection
    if (selectedCountry && countryIndex[selectedCountry]) {
        countryIndex[selectedCountry].forEach(e => e.polygon.material = Cesium.Color.fromCssColorString("#8da5ad").withAlpha(1));
    }
    if (selectedLabel) { 
        viewer.entities.remove(selectedLabel); 
        selectedLabel = null; 
    }

    // Correct or incorrect click
    if (countryName === targetCountry) {
        // Show "Correct!" message
        banner.textContent = "Correct!";
        banner.style.background = "#c8f7c5";
        countryIndex[countryName].forEach(e => e.polygon.material = Cesium.Color.fromCssColorString("#128f67").withAlpha(1));
        setTimeout(() => banner.style.background = "white", 500);

        // Start the next challenge after a short delay
        setTimeout(() => startCountryChallenge(), 1000);
    } else {
        // Wrong guess: cycle to next clue
        banner.style.background = "#f7c5c5";
        countryIndex[countryName].forEach(e => e.polygon.material = Cesium.Color.fromCssColorString("#d62828").withAlpha(1));
        currentClueIndex++;
        showNextClue();
        setTimeout(() => banner.style.background = "white", 500);
    }

    // Optional: show a label for the selected country
    const center = getPolygonCenter(countryIndex[countryName][0]);
    selectedLabel = viewer.entities.add({
        position: center,
        label: {
            text: countryName,
            font: "50px sans-serif",
            fillColor: Cesium.Color.YELLOW,
            outlineColor: Cesium.Color.WHITE,
            outlineWidth: 3,
            style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY
        }
    });
}, Cesium.ScreenSpaceEventType.LEFT_CLICK);