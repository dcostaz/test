// renderer.js
'use strict';

class MangaColumn {
  /** @type {string|null} */
  static _template = null;

  /**
   * Loads the HTML template for the manga column.
   * @returns {Promise<string>} - The loaded template string.
   * @static
   * @private
   */
  static async _loadTemplate() {
    if (this._template === null) {
      try {
        const fileUrl = new URL('./mangahakunekoentry.html', window.location.href).href;
        const response = await fetch(fileUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch template: ${response.statusText}`);
        }
        this._template = await response.text();
      } catch (error) {
        console.error('Failed to load MangaColumn template:', error);
        this._template = '<div style="color:red;">Failed to load manga template.</div>';
      }
    }
    return this._template;
  }

  /**
   * Helper function to convert chapters status text to HTML.
   * @param {string} input
   * @returns {string}
   * @static
   * @private
   */
  static _convertChaptersTextToHtml(input) {
    input = String(input);

    const lines = input.trim().split('\n').map(line => line.trim()).filter(line => line);

    const [headline, ...seasonLines] = lines;

    const seasonItems = seasonLines.map(line => {
      // Step 1: Replace escaped tilde (\\~) with placeholder
      let cleanLine = line.replace(/\\~/g, '__TILDE__');

      // Step 2: Replace normal tilde (~) with en dash
      cleanLine = cleanLine.replace(/~/g, '&ndash;');

      // Step 3: Restore literal tildes
      cleanLine = cleanLine.replace(/__TILDE__/g, '~');

      // Optional: bold the season label (S1, S2, etc.)
      cleanLine = cleanLine.replace(/^(\w+):/, '<strong>$1:</strong>');

      return `<li>${cleanLine}</li>`;
    });

    return `
    <section>
      <span>${headline}</span>
      <span>
          ${seasonItems.join('\n')}
      </span>
    </section>
  `.trim();
  }

  /**
   * MangaColumn constructor.
   * Represents a manga entry column.
   * @param {mangaHakuneko} record 
   */
  constructor(record) {
    /** @type {mangaHakuneko} */
    this.hakunekoEntry = record;

    /** @type {HTMLDivElement} */
    this.element = /** @type {HTMLDivElement} */ (document.createElement('div'));
    this.element.id = `${this.hakunekoEntry.key}`;
    this.element.className = 'column';
  }

  /**
   * Gets the image data for the manga entry.
   * @returns {Promise<string>} - The image data URL or path.
   */
  async _getImageData() {
    let mangaImageData = 'images/manga/placeholder.jpg';
    if (this.hakunekoEntry.himageAvailable) {
      const image = await window.api.getMangaImage(this.hakunekoEntry.key.concat('.jpg'));
      if (image) {
        mangaImageData = image;
      }
    }
    return mangaImageData;
  }

  _addButtons() {
    if (this.element) {
      const btn = /** @type {HTMLButtonElement} */ (document.createElement('button'));
      if (btn) {
        btn.textContent = 'Copy Key';
        btn.style = 'font-size:0.5em; color:#888; margin: 0px 0px 0px 0px; text-align:center;';
        btn.onclick = (ev) => {
          navigator.clipboard.writeText(this.hakunekoEntry.key)
            .catch(err => {
              alert('Failed to copy: ' + err);
            });
        };

        const span = /** @type {HTMLSpanElement} */ (this.element.querySelector('.copy_key_placeholder'));
        if (span) {
          span.appendChild(document.createTextNode(' '));
          span.appendChild(btn);
        }
      }
    }

    if (this.element && !(this.hakunekoEntry.id ? true : false)) {
      const btn = /** @type {HTMLButtonElement} */ (document.createElement('button'));
      if (btn) {
        btn.textContent = 'Search MangaUpdates for Match';
        btn.style = 'font-size:0.7em; color:#888; margin: 0px 0px 0px 0px; text-align:center;';
        btn.onclick = async (ev) => {
          this.openModal(ev);
        };

        const span = /** @type {HTMLSpanElement} */ (this.element.querySelector('.analyze_placeholder'));
        if (span) {
          span.appendChild(document.createTextNode('  '));
          span.appendChild(btn);
        }
      }
    }

    if (this.element) {
      const btn = /** @type {HTMLButtonElement} */ (document.createElement('button'));
      if (btn) {
        btn.textContent = '>';
        btn.style = 'font-size:0.7em; color:#888; margin: 0px 0px 0px 0px; text-align:center;';
        btn.onclick = async (ev) => {
          /** @type {HTMLDivElement} */
          (document.getElementById('block-modal')).style = '';
          await window.api.openCbzViewer(this.hakunekoEntry);
        };

        const span = /** @type {HTMLSpanElement} */ (this.element.querySelector('.viewer_placeholder'));
        if (span) {
          span.appendChild(document.createTextNode(' '));
          span.appendChild(btn);
        }
      }
    }
  }

  /**
   * Renders the manga column element.
   * @returns {Promise<HTMLDivElement>} - The rendered manga column element.
   * @async
   * @public
   */
  async render() {
    /** @type {mangaHakuneko} */
    const hakunekoEntry = this.hakunekoEntry;

    const template = await MangaColumn._loadTemplate();
    const mangaImageData = await this._getImageData();

    const templateData = {
      'record.hmanga_or_notitle': hakunekoEntry.hmanga || 'No Title',
      'record.style_if_no_id': !hakunekoEntry.id ? 'style="color: red;"' : '',
      'mangaImageData': mangaImageData,
      'record.key': hakunekoEntry.key,
      'record.id_or_empty': hakunekoEntry.id ? String(hakunekoEntry.id) : '',
      'record.hchapter_or_na': hakunekoEntry.hchapter || '- NA -',
      'record.hlastchapter_or_0': hakunekoEntry.hlastchapter !== null ? hakunekoEntry.hlastchapter : 0,
      'record.lastChapter_or_na': hakunekoEntry.lastChapter || '- NA - ',
      'record.type_or_na': hakunekoEntry.type || '- NA -',
      'record.year_or_na': hakunekoEntry.year || '- NA -',
      'record.completed_status': hakunekoEntry.completed === true ? 'Yes' : hakunekoEntry.completed === false ? 'No' : '- NA -',
      'record.status_html': hakunekoEntry.status !== undefined && hakunekoEntry.status !== null ? MangaColumn._convertChaptersTextToHtml(hakunekoEntry.status) : '- NA -'
    };

    let html = String(template);
    if (html !== null) {
      for (const [key, value] of Object.entries(templateData)) {
        html = html.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
    }

    if (html) {
      this.element.innerHTML = html;
      this._addButtons();
    }

    return this.element;
  }

  /**
   * Sanitize name for filesystem compatibility.
   * @param {string} name - The name to sanitize.
   * @returns {string} - The sanitized name.
   * @static
   */
  static sanitizedName(name) {
    if (!name || typeof (name) !== 'string')
      return '';

    return name
      .normalize('NFKD') // Normalize Unicode
      .replace(/–+/g, '-') // Collapse multiple spaces
      .replace(/[<>.,:;“”"/\\|?*\u0000-\u001F]/g, '') // Remove bad filesystem characters
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/[‘’`']/g, '') // Remove different single quotes
      .trim()
      .replace(/\.$/, '') // Remove trailing period
      .toLowerCase();
  }

  /**
   * Sets all MangaColumn buttons and dropdown menu items to disabled or enabled state.
   * @param {boolean} state
   * @returns {void}
   * @static
   */
  static setAllDisabled(state) {
    const dropdownMenu = /** @type {HTMLUListElement} */ (document.getElementById("dropdownMenu"));
    const openReviewBtn = /** @type {HTMLButtonElement} */ (document.getElementById("openReviewBtn"));
    dropdownMenu.querySelectorAll("li").forEach(li => {
      if (state) {
        li.dataset.disabled = "true";
      } else {
        delete li.dataset.disabled;
      }
    });

    // Disable the button
    if (openReviewBtn) {
      openReviewBtn.disabled = state;
    }
  }

  /**
   * Opens a modal for the specified Hakuneko entry.
   * @param {PointerEvent} ev - The event that triggered the modal.
   * @returns {Promise<void>}
   * @async
   * @public
   */
  async openModal(ev) {
    /** @type {mangaHakuneko} */
    const hakunekoEntry = this.hakunekoEntry;

    /**
     * Display the modal dialog to block user interaction.
     * @type {HTMLDivElement}
     */
    (document.getElementById('custom-modal')).style = '';

    const modalHeader = /** @type {HTMLDivElement} */ (document.getElementById('modal-header'));

    const header = document.createElement('h4');
    header.className = 'manga-title';
    header.title = `${hakunekoEntry.hmanga || 'No Title'}`;
    header.style.color = hakunekoEntry.id ? '' : 'red';
    header.textContent = hakunekoEntry.hmanga || 'No Title';
    modalHeader.appendChild(header);

    const modalBody = /** @type {HTMLDivElement} */ (document.getElementById('modal-body'));

    /** @type {MangaUpdatesSearchSeriesResultEntry[]} */
    const searchResults = await window.api.searchMangaUpdatesSerieByName(hakunekoEntry.hmanga, !ev.ctrlKey);

    for (const result of searchResults) {
      const rowDiv = document.createElement('div');
      if (MangaColumn.sanitizedName(result.hit_title) === MangaColumn.sanitizedName(hakunekoEntry.hmanga)) {
        rowDiv.className = 'entry-match';
      } else {
        rowDiv.className = 'entry';
      }

      /** @type {mangaReviewItemObj} */
      const selectionObj = {
        titleMatch: 'ta',
        title: result.hit_title,
        normalized: MangaColumn.sanitizedName(result.hit_title),
        directory: hakunekoEntry.hfolder,
        key: hakunekoEntry.key
      }

      // Create the button
      const searchIDBtn = document.createElement('button');
      searchIDBtn.textContent = 'Search ID';
      searchIDBtn.onclick =
        /**
         * Callback for search ID button click.
         * @param {PointerEvent} ev
         */
        async (ev) => {
          // Prevent default button behavior
          ev.preventDefault();

          // Disable the button
          searchIDBtn.disabled = true;

          /**
           * Search for Manga in MangaUpdates by ID
           * If Ctrl key is being pressed when the button is clicked, it forces a fresh fetch
           * @type {MangaUpdatesSeriesResultEntry}
           */
          const resultEntry = await window.api.searchMangaUpdatesSerieByID(result.record.series_id, !ev.ctrlKey);

          // Do something with the entry
          /** @type {HTMLDivElement|null} */
          const placeholder = colDiv.querySelector('.search-id-results-placeholder');
          if (placeholder)
            placeholder.innerHTML = `
              <hr>
              <span style="font-weight:bold; font-size:.8em;">Search Results:</span>
              <div>Path: ${hakunekoEntry.path}</div>
              <div>ID: ${resultEntry.series_id}</div>
              <div>Title: ${resultEntry.title}</div>
              <div>Chapters: ${resultEntry.latest_chapter}</div>
              <div>Status: ${resultEntry.status}</div>
              <div>Type: ${resultEntry.type}</div>
              <div>Year: ${resultEntry.year}</div>
              <div>Associated Titles:</div>
              <ul id="${resultEntry.series_id}">
                ${resultEntry.associated.map(at => `<li>${at.title}</li>`).join('')}
              </ul>
          `;

          // Add a button to each associated title <li>
          const ul = colDiv.querySelector('ul');
          if (ul) {
            Array.from(ul.querySelectorAll('li')).forEach(li => {
              if (MangaColumn.sanitizedName(li.textContent) === MangaColumn.sanitizedName(hakunekoEntry.hmanga)) {
                const btn = document.createElement('button');
                btn.textContent = 'Resolve';
                btn.onclick = async () => {
                  // Call your function with the series_id as parameter
                  await window.api.resolveUnmatchedEntry(resultEntry.series_id, selectionObj);
                  this.closeModal();
                  MangaColumn.setAllDisabled(true);
                  //await window.api.reloadHakunekoList();
                  const container = /** @type {HTMLDivElement} */ (document.getElementById('records-container'));
                  container.innerHTML = ''; // Clear existing records
                }; // btn.onclick
                li.appendChild(document.createTextNode(' ')); // Add space before button
                li.appendChild(btn);

                // Prepare hover text information
                const selectHelpInfo = Object.entries(selectionObj).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join('\n');

                // Add an information symbol for hover text
                const infoSymbol = document.createElement('span');
                infoSymbol.style = 'font-size:0.9em; color:gray; margin-left:4px; cursor: help;';
                infoSymbol.textContent = ' ℹ️';
                infoSymbol.title = 'Direct match by title'.concat('\n', `ID: ${result.record.series_id}`, '\n', selectHelpInfo);
                li.appendChild(infoSymbol);
              } // if (li.textContent === resultEntry.title)
            }); // Array.from(ul.querySelectorAll('li')).forEach
          } // if (ul)

          // Re-enable the button
          searchIDBtn.disabled = false;
        }; // searchIDBtn.onclick

      // Create the column div
      const colDiv = document.createElement('div');
      colDiv.className = '';
      colDiv.innerHTML = `
          <span style="font-weight:bold; font-size:.8em;">ID: </span>
          <span style="text-align:left; font-size:.7em;">
          ${result.record.series_id || '- NA -'}
          </span>&nbsp;
          <span class="search-id-btn-placeholder"></span>
          <br>
          <span style="font-weight:bold; font-size:.8em;">Hit: </span>
          <span style="text-align:left; font-size:.7em;">
          ${result.hit_title || '- NA -'}
          </span><br>
          <span style="font-weight:bold; font-size:.8em;">Serie Title: </span>
          <span class="has-title" style="text-align:left; font-size:.7em;">
          ${result.record.title || '- NA -'}
          </span>
          <br>
          <div class="search-id-results-placeholder"></div>
        `;

      /**
       * Helper function to handle the resolve button click event.
       * @param {number} id - The series ID to resolve.
       * @param {mangaReviewItemObj} selectionObj - The selection object containing the details of the manga to resolve.
       * @returns {Promise<void>}
       * @async
       */
      const handleResolveBtnClick = async (id, selectionObj) => {
        // Resolve the entry
        await window.api.resolveUnmatchedEntry(id, selectionObj);

        // Close the modal, disable all buttons and refresh the list
        this.closeModal();
        MangaColumn.setAllDisabled(true);
        //await window.api.reloadHakunekoList();

        // Get the records container and clear the div
        const container = /** @type {HTMLDivElement} */ (document.getElementById('records-container'));
        container.innerHTML = '';
      }

      // Check for direct match
      const directMatch = MangaColumn.sanitizedName(result.record.title) === MangaColumn.sanitizedName(hakunekoEntry.hmanga);

      // Check for starts-with match
      const startsWithMatch = MangaColumn.sanitizedName(result.record.title).startsWith(MangaColumn.sanitizedName(hakunekoEntry.hmanga));

      // No Match
      const noMatch = !directMatch && !startsWithMatch;

      // If there's a match, add a "Resolve" button
      if (noMatch || directMatch || startsWithMatch) {
        /** @type {mangaReviewItemObj} */
        const selectionObj = {
          titleMatch: 'ta',
          title: result.hit_title,
          normalized: MangaColumn.sanitizedName(result.hit_title),
          directory: hakunekoEntry.hfolder,
          key: hakunekoEntry.key
        }

        // Update the selection object based on the match type
        if (directMatch) {
          selectionObj.titleMatch = 'tm';
        } else if (startsWithMatch) {
          selectionObj.titleMatch = 'ts';
        }

        // Create the button
        const btn = document.createElement('button');
        btn.style = 'font-size:0.7em; color:darkblue; margin: 0px 0px 0px 0px; text-align:center;';
        btn.textContent = 'Resolve';
        btn.onclick = async () => await handleResolveBtnClick(result.record.series_id, selectionObj);

        // Append the button to the title span
        const span = /** @type {HTMLSpanElement} */ (colDiv.querySelector('.has-title'));
        span.appendChild(document.createTextNode(' ')); // Add space before button
        span.appendChild(btn);

        // Prepare hover text information
        const selectHelpInfo = Object.entries(selectionObj).map(([key, value]) => `${key.toUpperCase()}: ${value}`).join('\n');

        // Add an information symbol for hover text
        const infoSymbol = document.createElement('span');
        infoSymbol.style = 'font-size:0.9em; color:gray; margin-left:4px; cursor: help;';
        infoSymbol.textContent = ' ℹ️';
        infoSymbol.title = noMatch ? 'No Match' : (directMatch ? 'Direct match by title' : 'Match by title starts with').concat('\n', `ID: ${result.record.series_id}`, '\n', selectHelpInfo);
        span.appendChild(infoSymbol);
      }

      // Insert the button into the placeholder span
      const placeholder = colDiv.querySelector('.search-id-btn-placeholder');
      if (result.record.series_id && placeholder) {
        placeholder.appendChild(searchIDBtn);
      }

      rowDiv.appendChild(colDiv);
      modalBody.appendChild(rowDiv);

      const btnClose = /** @type {HTMLButtonElement} */ (document.getElementById('closeModalBtn'));
      btnClose.addEventListener('click', this.closeModal);

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === ' ') {
          const modalStyle = /** @type {HTMLDivElement} */ (document.getElementById('custom-modal')).style;
          if (modalStyle.display !== 'none') {
            this.closeModal();
            e.stopPropagation();
          }
        }
      });
    } // for (const result of searchResults
  } // openModal

  /**
   * Closes the modal dialog.
   * Also clears the modal content.
   * @returns {void}
   */
  closeModal() {
    /** @type {HTMLDivElement} */ (document.getElementById('custom-modal')).style = 'display: none;';

    // Clear modal header
    const modalHeader = /** @type {HTMLDivElement} */ (document.getElementById('modal-header'));
    modalHeader.innerHTML = '';

    // Clear modal content
    const modalBody = /** @type {HTMLDivElement} */ (document.getElementById('modal-body'));
    modalBody.innerHTML = '';
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  let hakuneko = await window.api.getHakunekoReadingList();
  const container = /** @type {HTMLDivElement} */ (document.getElementById('records-container'));

  /** @type {string} */
  let filterLetter = ''; // e.g., set window.filterLetter = 'A' to filter by 'A'

  function refreshLetters() {
    // Set the default filter letter if none is set
    if (!filterLetter) {
      filterLetter = '#';
    }

    // Set the matching button as disabled, others enabled
    const letterButtons = document.querySelectorAll('#letter-buttons button');
    letterButtons.forEach(btn => {
      const btnText = btn.textContent.trim();
      /** @type {HTMLButtonElement} */ (btn).disabled = (btnText === filterLetter);
    });
  }

  // Add listeners to letter buttons
  const letterButtons = document.querySelectorAll('#letter-buttons button');
  letterButtons.forEach(btn => {
    const letterButton = /** @type {HTMLButtonElement} */ (btn);
    letterButton.addEventListener('click', () => {
      refreshLetters();
      letterButton.disabled = true;
      updateData(letterButton.textContent.trim());
    });
  });

  /**
   * Updates the filter letter for the manga list.
   * @param {string} letter
   */
  function updateData(letter = '#') {
    // Update the filter letter
    filterLetter = letter;

    // Set the matching button as disabled, others enabled
    refreshLetters();
    container.innerHTML = ''; // Clear existing records

    // Re-render the manga list
    renderMangas();
  }

  /**
   * Renders the manga entries.
   * @param {number} page
   */
  async function renderMangas(page = 1) {
    // Render 7 objects per row, max 300 rows (2,100 objects)
    // Filter by a specific first letter (case-insensitive)
    /** @type {[string, mangaHakuneko][]} */
    const entries = Object.entries(hakuneko)
      .filter(hak => {
        const title = hak[1].hmanga || '';
        if (filterLetter === '#') {
          // Not A-Z
          return !/^[a-z]/i.test(title.trim());
        } else {
          return title.toLowerCase().startsWith(filterLetter.toLowerCase());
        }
      })
      //.filter(hak => !hak[1].id)
      //.filter(hak => !hak.himageAvailable)
      .sort((a, b) => {
        // Sort by hlastModified descending
        const dateA = a[1].hlastModified ? new Date(a[1].hlastModified) : new Date(0);
        const dateB = b[1].hlastModified ? new Date(b[1].hlastModified) : new Date(0);
        return new Date(dateB ?? 0).getTime() - new Date(dateA ?? 0).getTime();
      });

    const countSpan = /** @type {HTMLSpanElement} */ (document.querySelector('#count'));
    if (countSpan) {
      countSpan.innerHTML = String(entries.length).toString();
    }

    const maxRows = 100;
    const itemsPerRow = 7;

    for (let row = 0; row < maxRows; row++) {
      const start = row * itemsPerRow;
      const end = start + itemsPerRow;
      if (start >= entries.length) break;

      const rowDiv = document.createElement('div');
      rowDiv.className = 'row';

      entries.slice(start, end).forEach(async ([_, record]) => {
        const mangaColumn = new MangaColumn(record);
        const colDiv = await mangaColumn.render();
        rowDiv.appendChild(colDiv);
      });

      container.appendChild(rowDiv);
    }
  }

  window.api.onReloadMangaUpdatesReadingListDone(() => {
    MangaColumn.setAllDisabled(false);
  });

  /**
   * Callback when CBZ viewer window is closed.
   * @param {string} key
   * @param {number} chapterNumber
   */
  window.api.onCBZViewerClosed((key, chapterNumber) => {
    /** @type {HTMLDivElement} */ (document.getElementById('block-modal')).style = 'display: none;';

    if (key && chapterNumber) {
      const serie = /** @type {HTMLDivElement} */ (document.getElementById(''.concat(key)));

      if (serie) {
        const currentChapter = /** @type {HTMLSpanElement} */ (serie.querySelector('#current-chapter'));
        if (currentChapter) {
          currentChapter.innerText = String(chapterNumber);
          const obj = Object.values(hakuneko).find(o => o.key === key);
          if (obj) {
            obj.hchapter = chapterNumber;
          }
        }
      }
    }
  });

  const toggleBtn = /** @type {HTMLButtonElement} */ (document.getElementById("toggleBtn"));
  const dropdownMenu = /** @type {HTMLUListElement} */ (document.getElementById("dropdownMenu"));
  const openReviewBtn = /** @type {HTMLButtonElement} */ (document.getElementById("openReviewBtn"));

  // Listen for completion events from main process
  window.api.onResolveUnmatchedEntryDone(async () => {
    // Call loadHakuneko
    await loadHakuneko();

    renderMangas();
    MangaColumn.setAllDisabled(false);
  });

  window.api.onReloadMangaUpdatesReadingListDone(() => {
    MangaColumn.setAllDisabled(false);
  });

  window.api.onReloadMangaUpdatesReadingListFailed(() => {
    alert('failed to Reload MangaUpdates List.')
    MangaColumn.setAllDisabled(false);
  });

  window.api.onReloadMangaReadingListDone(() => {
    MangaColumn.setAllDisabled(false);
  });

  window.api.onReloadMangaReadingListFailed(() => {
    alert('failed to Reload Manga List.')
    MangaColumn.setAllDisabled(false);
  });

  window.api.onSyncReadingListDone(() => {
    MangaColumn.setAllDisabled(false);
  });

  window.api.onSyncReadingListFailed(() => {
    alert('failed to Sync List.')
    MangaColumn.setAllDisabled(false);
  });

  /**
   * Pull Manga Hukuneko data and reload grid
   * @returns {Promise<void>}
   * @async
   */
  async function loadHakuneko() {
    if (window.api && window.api.hasOwnProperty("getHakunekoReadingList")) {
      try {
        hakuneko = await window.api.getHakunekoReadingList();
      } catch (error) {
        console.error(error);
      }
    } else {
      console.log('(loadHakuneko) getHakunekoReadingList not available.')
    }
  }

  window.api.onReloadHakunekoListDone(async () => {
    // Call loadHakuneko
    await loadHakuneko();

    renderMangas();
    MangaColumn.setAllDisabled(false);
  });

  window.api.onReloadHakunekoListFailed(() => {
    alert('failed to Reload Hakuneko List.')

    renderMangas();
    MangaColumn.setAllDisabled(false);
  });

  // Toggle dropdown
  toggleBtn.addEventListener("click", () => {
    dropdownMenu.hidden = !dropdownMenu.hidden;
  });

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (!toggleBtn.contains(target) && !dropdownMenu.contains(target)) {
      dropdownMenu.hidden = true;
    }
  });

  // Handle dropdown item clicks
  dropdownMenu.addEventListener("click", async (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    const clickedItem = target.closest("li");
    if (!clickedItem) return;

    const selectedText = clickedItem.textContent.trim();

    if (selectedText === 'Reload MangaUpdates Reading List') {
      MangaColumn.setAllDisabled(true);
      await window.api.reloadMangaUpdatesReadingList();
    }
    else if (selectedText === 'Reload MangaReading List') {
      MangaColumn.setAllDisabled(true);
      await window.api.reloadMangaReadingList();
    }
    else if (selectedText === 'Re-build Hakuneko List') {
      MangaColumn.setAllDisabled(true);
      await window.api.reloadHakunekoList();
      container.innerHTML = ''; // Clear existing records
    }
    else if (selectedText === 'Sync Reading List') {
      MangaColumn.setAllDisabled(true);
      await window.api.syncReadingList();
    }

    // Example: trigger IPC or update UI
    // window.electronAPI.sendSelection(selectedText);

    dropdownMenu.hidden = true; // Close dropdown after selection
  });

  // Action button behavior
  openReviewBtn.addEventListener("click", async () => {
    MangaColumn.setAllDisabled(true);
    window.api.openReviewWindow();
  });

  updateData(); // Initial filter letter
});
