'use strict';

window.addEventListener('DOMContentLoaded', () => {
    const imageContainer = /** @type {HTMLDivElement} */ (document.getElementById('image-container'));

    window.viewerAPI.onReceiveCbzImages((event, images) => {
        // Clear any existing images
        imageContainer.innerHTML = '';

        if (!images || images.length === 0) {
            imageContainer.textContent = 'No images found.';
            return;
        }

        // Create and append an img element for each image
        images.forEach(imageSrc => {
            const img = document.createElement('img');
            img.src = imageSrc;
            img.alt = 'Manga Page';
            imageContainer.appendChild(img);
        });
    });
});
