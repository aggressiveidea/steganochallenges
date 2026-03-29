document.addEventListener('DOMContentLoaded', () => {
    const challenges = [
        {
            id: 1,
            title: 'Chapter I: The Whispering Image',
            description: 'They say pictures speak a thousand words. This one screams. Find the hidden message buried within the pixels before it finds you.',
            difficulty: 'Easy',
            points: 100,
            locked: false
        },
        {
            id: 2,
            title: 'Chapter II: Blood LSB',
            description: 'The Least Significant Bit holds the most significant secrets. The trail of data leads into the dark. Do not stray off the path.',
            difficulty: 'Medium',
            points: 250,
            locked: false
        },
        {
            id: 3,
            title: 'Chapter III: Spectral Frequencies',
            description: 'To the naked ear, it is just static. To the trained eye, it forms a shape. Analyze the spectrogram to reveal the entity\'s name.',
            difficulty: 'Medium',
            points: 300,
            locked: false
        },
        {
            id: 4,
            title: 'Chapter IV: Out of Bounds',
            description: 'The file ends, but the data does not. What lies beyond the EOF marker? Only the bravest dare to append.',
            difficulty: 'Hard',
            points: 500,
            locked: false
        },
        {
            id: 5,
            title: 'Chapter V: The Final Cipher',
            description: 'A layered defense. Extract the embedded compressed archive, crack the password, and decrypt the hidden payload. Good luck.',
            difficulty: 'Nightmare',
            points: 1000,
            locked: true
        }
    ];

    const challengeList = document.getElementById('challenge-list');
    const modal = document.getElementById('challenge-modal');
    const closeBtn = document.getElementById('close-btn');
    
    // Audio elements
    const hoverSound = document.getElementById('hover-sound');
    const clickSound = document.getElementById('click-sound');

    // Populate challenges
    challenges.forEach((challenge, index) => {
        const li = document.createElement('li');
        li.className = `challenge-item ${challenge.locked ? 'locked' : ''}`;
        li.textContent = challenge.locked ? '??? ??? ???' : challenge.title;
        li.style.animationDelay = `${index * 0.1}s`;

        if (!challenge.locked) {
            li.addEventListener('mouseenter', () => {
                hoverSound.currentTime = 0;
                hoverSound.volume = 0.2;
                hoverSound.play().catch(() => {}); // Catch error if user hasn't interacted
            });

            li.addEventListener('click', () => {
                clickSound.currentTime = 0;
                clickSound.volume = 0.5;
                clickSound.play().catch(() => {});
                openModal(challenge);
            });
        }
        
        challengeList.appendChild(li);
    });

    function openModal(challenge) {
        document.getElementById('modal-title').textContent = challenge.title;
        document.getElementById('modal-desc').textContent = challenge.description;
        document.getElementById('modal-difficulty').textContent = `Difficulty: ${challenge.difficulty}`;
        document.getElementById('modal-points').textContent = `Points: ${challenge.points}`;
        
        modal.classList.add('active');
    }

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.classList.remove('active');
        }
    });
});
