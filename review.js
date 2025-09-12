// review.js
'use strict';

window.addEventListener('DOMContentLoaded', async () => {
  // Define helper to get Review List data
    /**
     * Refresh the review list data from the API.
     * @returns {Promise<mangaSerieReviewitemObj[]>}
     */
    const refreshReviewListData = async () => {
        if (window.api && window.api.hasOwnProperty("getUnmatchedFromReadingList")) {
            try {
                return await window.api.getUnmatchedFromReadingList();
            } catch (error) {
                console.log('(refreshReviewListData) getRecords not available.');
            }
        }

        return [];
    }

    // Fetch unmatched entries from the main process via preload
    /** @type {mangaSerieReviewitemObj[]} */
    let unmatched = await refreshReviewListData();

    const container = /** @type {HTMLDivElement} */ (document.getElementById('review-list'));

    // Listen for completion events from main process

    window.api.onResolveUnmatchedEntryDone((id, selectedEntry) => {
        // Reference to Serie specific resolve button
        const button = /** @type {HTMLButtonElement} */ (document.getElementById('rm' + String(id)));

        // Create a log trail about the resolution
        console.log(`Entry with ID ${id} resolved to directory: ${selectedEntry.directory}`);

        // remove the div for the serie that was reviewed
        // No need to reload all
        deleteReviewEntry(id);

        // Enable the buttons for the remaining series div
        const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('button'));
        buttons.forEach((btn) => {
            btn.disabled = false;
        });

        // Remove unmatched entries for serie id
        // Get the entry index from unmatchedfromreadinglist by ID
        const idx = unmatched.findIndex(entry => entry.id === id);
        if (idx !== -1) {
            // Get the entry from unmatchedfromreadinglist
            const entry = unmatched[idx];

            // Remove entry from unmatchedfromreadinglist
            unmatched.splice(idx, 1);
        }

        // Show empty records
        if (!unmatched.length) {
            const noReviewList = /** @type {NodeListOf<HTMLParagraphElement>} */ (document.querySelectorAll('#review-list p.no-entries'));
            noReviewList.forEach((p) => {
                p.classList.remove('no-entries');
            });
        }
    });

    window.api.onResolveUnmatchedEntryFailed((id, selectedEntry) => {
        // Reference to Serie specific resolve button
        const button = /** @type {HTMLButtonElement} */ (document.getElementById('rm' + String(id)));

        // Create a log trail about the resolution failure
        console.log(`Entry with ID ${id} could not be resolved to directory: ${selectedEntry.directory}`);

        // Show an alert pop-up so that the user needs to acknowledge the error
        alert(`Entry with ID ${id} could not be resolved to directory: ${selectedEntry.directory}`);

        // Enable the buttons for all series div
        // None were removed due to error
        const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('button'));
        buttons.forEach((btn) => {
            btn.disabled = false;
        });
    });

    window.api.onRemoveUnmatchedEntryDone((id) => {
        // Reference to Serie specific remove button
        const button = /** @type {HTMLButtonElement} */ (document.getElementById('rm' + String(id)));

        // Create a log trail about the removal
        console.log(`Entry with ID ${id} was removed.`);

        // remove the div for the serie that was reviewed
        // No need to reload all
        deleteReviewEntry(id);

        // Enable the buttons for the remaining series div
        const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('button'));
        buttons.forEach((btn) => {
            btn.disabled = false;
        });

        // Remove unmatched entries for serie id
        // Get the entry index from unmatchedfromreadinglist by ID
        const idx = unmatched.findIndex(entry => entry.id === id);
        if (idx !== -1) {
            // Get the entry from unmatchedfromreadinglist
            const entry = unmatched[idx];

            // Remove entry from unmatchedfromreadinglist
            unmatched.splice(idx, 1);
        }

        // Show empty records
        if (!unmatched.length) {
            const noReviewList = /** @type {NodeListOf<HTMLParagraphElement>} */ (document.querySelectorAll('#review-list p.no-entries'));
            noReviewList.forEach((p) => {
                p.classList.remove('no-entries');
            });
        }
    });

    window.api.onRemoveUnmatchedEntryFailed((id) => {
        // Reference to Serie specific remove button
        const button = /** @type {HTMLButtonElement} */ (document.getElementById('rm' + String(id)));

        // Create a log trail about the removal failure
        console.error(`Entry with ID ${id} could not be removed.`);

        // Show an alert pop-up so that the user needs to acknowledge the error
        alert(`Entry with ID ${id} could not be removed.`);

        // Enable the buttons for all series div
        // None were removed due to error
        const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('button'));
        buttons.forEach((btn) => {
            btn.disabled = false;
        });
    });

    if (!unmatched.length) {
        const noReviewList = /** @type {NodeListOf<HTMLParagraphElement>} */ (document.querySelectorAll('#review-list p.no-entries'));
        noReviewList.forEach((p) => {
            p.classList.remove('no-entries');
        });
        return;
    }

    const mangaupdatesTitleMatch = [
        { id: 'tn', description: 'TITLE_NO_MATCH' }, // No match available
        { id: 'tm', description: 'TITLE_MATCH' }, // Title match with MangaUpdates (default)
        { id: 'ts', description: 'TITLE_SIMILAR' }, // Title similar
        { id: 'ta', description: 'ASSOCIATED_TITLE' }, // Associated title match
        { id: 'tz', description: 'ASSOCIATED_TITLE_SIMILAR' },  // Associated title similar
        { id: 'tr', description: 'TITLE_MATCH_REVIEW' } // Title match by user review
    ];

    unmatched.forEach(entry => {
        const div = document.createElement('div');
        div.className = 'entry';
        div.id = 'reviewListEntry_'.concat(String(entry.id).toString());
        div.innerHTML = `
      <div>  
        <strong>Title:</strong> ${entry.title}
        <button id="rm${entry.id}" onclick="removeEntry('${entry.id}')">Remove Unresolved Serie</button>
      </div>
      <br>
      <div class="directory-list" style="margin:0px;">
        <strong>Possible Directories:</strong>
        <table>
        ${entry.possibleDirectories.map((d, i) =>
            `<tr class="possible-directory" title="(T) ${d.title + ' ==> (D) ' + d.directory}" data-radio-id="radio-${entry.id}-${i}" style="cursor: pointer;">
                <td>
                    <span>
                        <input type="radio" name="dir-${entry.id}" id="radio-${entry.id}-${i}" value="${i}" title="${d.directory}">
                    </span>
                </td>
                <td>
                    <span class="labelled-title" title="${mangaupdatesTitleMatch.find(tm => tm.id === d.titleMatch)?.description}">
                        <span class="label title-match">(${d.titleMatch})</span>
                        <strong>${(d.title.length > 140 ? d.title.slice(0, 140) + '…' : d.title)}</strong><br>
                        <span class="label">&nbsp;</span>
                        ${(d.directory.length > 140 ? d.directory.slice(0, 140) + '…' : d.directory)}
                    </span>   
                </td>
            </tr>`
        ).join('')}
        </table>
      </div>
      <div>
        <button id="${entry.id}" onclick="resolveEntry('${entry.id}')">Resolve</button>
      </div>
      <br>
      <strong>Associated Titles:</strong><br>
      ${entry.associatedTitles ? entry.associatedTitles.map(a => '<span style="text-align:left; font-size:.8em;">- ' + a.title + '</span>').join('<br>') : '<br>'}
    `;
        container.appendChild(div);
    });

    document.querySelectorAll('.possible-directory').forEach(tr => {
        tr.addEventListener('click', event => {
            const radioId = /** @type {string} */ (tr.getAttribute('data-radio-id'));
            const radio = /** @type {HTMLInputElement} */ (document.getElementById(radioId));

            // Ignore if the click is directly on the radio input
            const target = event.target;
            if (target instanceof Element && target.tagName.toLowerCase() !== 'input') {
                radio.checked = !radio.checked;
            }
        });
    });
});

/**
 * Delete a div "reviewListEntry_" from the page based on the id
 * 
 * @param {number} id 
 */
function deleteReviewEntry(id) {
    const entry = document.getElementById(`reviewListEntry_${id}`);
    if (entry && entry.parentNode) {
        entry.parentNode.removeChild(entry);
    }
}

/**
 * 
 * @param {number} id 
 * @returns {Promise<void>}
 */
async function resolveEntry(id) {
    const serieID = Number(id);
    /** @type {mangaSerieReviewitemObj[]} */
    const unmatched = await window.api.getUnmatchedFromReadingList();

    const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('button'));
    buttons.forEach((btn) => {
        btn.disabled = true;
    });

    // Get selected directory
    const radios = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(`input[name="dir-${serieID}"]`));
    let selectedEntry = -1;

    radios.forEach(r => {
        if (r.checked) selectedEntry = Number(r.value);
    });

    if (selectedEntry === -1) {
        alert('Please select a directory.');
        return;
    }

    // Send resolution to main process
    const forReview = /** @type {mangaSerieReviewitemObj} */ (unmatched.find(um => um.id === serieID));
    const selectionObj = forReview.possibleDirectories[selectedEntry];
    await window.api.resolveUnmatchedEntry(serieID, selectionObj);
}

/**
 * 
 * @param {number} id 
 * @returns {Promise<void>}
 */
async function removeEntry(id) {
    const serieID = Number(id);

    const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('button'));
    buttons.forEach((btn) => {
        btn.disabled = true;
    });

    // Send resolution to main process
    await window.api.removeUnmatchedEntry(serieID);
}