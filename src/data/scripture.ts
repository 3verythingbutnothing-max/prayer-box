// Selected Scripture copied from the publisher’s primary engwebp HTML on 2026-10-24.
// Only verse selections are bundled. Whitespace is normalized; words and punctuation are preserved.
// Final edition and editorial copy remain subject to founder approval.
export interface ScriptureVerse {
  verse: number;
  text: string;
}
export interface ScriptureSegment {
  reference: string;
  verses: ScriptureVerse[];
}
export interface ScriptureNote {
  verse: number;
  text: string;
}
export interface ScriptureQuotation {
  reference: string;
  sourceUrl: string;
  segments: ScriptureSegment[];
  notes: ScriptureNote[];
}
export interface ScriptureEntry extends ScriptureQuotation {
  id: string;
  theme: string;
  explanation: string;
}
export const scriptureEdition = {
  name: "World English Bible — updated U.S.-spelling text (engwebp)",
  shortName: "World English Bible (WEB, engwebp)",
  status: "Proposed prototype edition",
  checkedAt: "October 24, 2026",
  publisherUrl: "https://ebible.org/engwebp/",
  reuseUrl: "https://ebible.org/engwebp/copyright.htm",
};

export const scriptureThemes: string[] = [
  "One God: Father, Son, and Holy Spirit",
  "Why we pray in Jesus’ name",
  "James: prayer, care, and honest motives",
  "Paul: praying for one another",
  "Jesus’ teaching and the praying church",
  "When we are weak, while we wait, and when we give thanks",
];

export const scriptureEntries: ScriptureEntry[] = [
  {
    id: "scripture-01",
    reference: "Matthew 28:19",
    theme: "One God: Father, Son, and Holy Spirit",
    explanation:
      "Jesus names the Father, Son, and Holy Spirit together in the baptismal commission. This supplies doctrinal context; it is not a command about an exact prayer ending.",
    sourceUrl: "https://ebible.org/engwebp/MAT28.htm",
    segments: [
      {
        reference: "Matthew 28:19",
        verses: [
          {
            verse: 19,
            text: "Go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit,",
          },
        ],
      },
    ],
    notes: [
      {
        verse: 19,
        text: "TR and NU add “therefore”",
      },
    ],
  },
  {
    id: "scripture-02",
    reference: "Matthew 3:16–17",
    theme: "One God: Father, Son, and Holy Spirit",
    explanation:
      "At Jesus’ baptism, the Son is baptized, the Spirit descends, and the Father speaks. Read the persons as distinct, not successive disguises.",
    sourceUrl: "https://ebible.org/engwebp/MAT03.htm",
    segments: [
      {
        reference: "Matthew 3:16–17",
        verses: [
          {
            verse: 16,
            text: "Jesus, when he was baptized, went up directly from the water: and behold, the heavens were opened to him. He saw the Spirit of God descending as a dove, and coming on him.",
          },
          {
            verse: 17,
            text: "Behold, a voice out of the heavens said, “This is my beloved Son, with whom I am well pleased.”",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-03",
    reference: "John 1:1–3, 14",
    theme: "One God: Father, Son, and Holy Spirit",
    explanation:
      "The Word is with God and is God, and becomes flesh. These passages underpin the site’s confession of Jesus’ deity and incarnation.",
    sourceUrl: "https://ebible.org/engwebp/JHN01.htm",
    segments: [
      {
        reference: "John 1:1–3",
        verses: [
          {
            verse: 1,
            text: "In the beginning was the Word, and the Word was with God, and the Word was God.",
          },
          {
            verse: 2,
            text: "The same was in the beginning with God.",
          },
          {
            verse: 3,
            text: "All things were made through him. Without him, nothing was made that has been made.",
          },
        ],
      },
      {
        reference: "John 1:14",
        verses: [
          {
            verse: 14,
            text: "The Word became flesh and lived among us. We saw his glory, such glory as of the only born Son of the Father, full of grace and truth.",
          },
        ],
      },
    ],
    notes: [
      {
        verse: 14,
        text: "The phrase “only born” is from the Greek word “μονογενους”, which is sometimes translated “only begotten” or “one and only”.",
      },
    ],
  },
  {
    id: "scripture-04",
    reference: "John 14:16–17",
    theme: "One God: Father, Son, and Holy Spirit",
    explanation:
      "Jesus asks the Father to give another Helper, the Spirit of truth. The passage distinguishes the Son, Father, and Spirit.",
    sourceUrl: "https://ebible.org/engwebp/JHN14.htm",
    segments: [
      {
        reference: "John 14:16–17",
        verses: [
          {
            verse: 16,
            text: "I will pray to the Father, and he will give you another Counselor, that he may be with you forever:",
          },
          {
            verse: 17,
            text: "the Spirit of truth, whom the world can’t receive, for it doesn’t see him and doesn’t know him. You know him, for he lives with you and will be in you.",
          },
        ],
      },
    ],
    notes: [
      {
        verse: 16,
        text: "Greek παρακλητον: Counselor, Helper, Intercessor, Advocate, and Comforter.",
      },
    ],
  },
  {
    id: "scripture-05",
    reference: "Ephesians 2:18",
    theme: "One God: Father, Son, and Holy Spirit",
    explanation:
      "Through Christ, believers have access to the Father in one Spirit. This is the clearest short anchor for the site’s explanation of Trinitarian prayer.",
    sourceUrl: "https://ebible.org/engwebp/EPH02.htm",
    segments: [
      {
        reference: "Ephesians 2:18",
        verses: [
          {
            verse: 18,
            text: "For through him we both have our access in one Spirit to the Father.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-06",
    reference: "2 Corinthians 13:14",
    theme: "One God: Father, Son, and Holy Spirit",
    explanation:
      "Paul closes with a blessing naming Jesus Christ, God’s love, and the Holy Spirit’s fellowship together.",
    sourceUrl: "https://ebible.org/engwebp/2CO13.htm",
    segments: [
      {
        reference: "2 Corinthians 13:14",
        verses: [
          {
            verse: 14,
            text: "The grace of the Lord Jesus Christ, God’s love, and the fellowship of the Holy Spirit be with you all. Amen.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-07",
    reference: "John 14:13–14",
    theme: "Why we pray in Jesus’ name",
    explanation:
      "Jesus connects asking in his name with the Father being glorified in the Son. Keep that purpose attached to the promise.",
    sourceUrl: "https://ebible.org/engwebp/JHN14.htm",
    segments: [
      {
        reference: "John 14:13–14",
        verses: [
          {
            verse: 13,
            text: "Whatever you will ask in my name, I will do it, that the Father may be glorified in the Son.",
          },
          {
            verse: 14,
            text: "If you will ask anything in my name, I will do it.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-08",
    reference: "John 15:7",
    theme: "Why we pray in Jesus’ name",
    explanation:
      "Prayer is connected to remaining in Christ and his words remaining in believers; it is not detached from relationship and discipleship.",
    sourceUrl: "https://ebible.org/engwebp/JHN15.htm",
    segments: [
      {
        reference: "John 15:7",
        verses: [
          {
            verse: 7,
            text: "If you remain in me, and my words remain in you, you will ask whatever you desire, and it will be done for you.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-09",
    reference: "John 15:16",
    theme: "Why we pray in Jesus’ name",
    explanation:
      "Asking the Father in Jesus’ name appears alongside Jesus’ appointment of disciples to bear lasting fruit.",
    sourceUrl: "https://ebible.org/engwebp/JHN15.htm",
    segments: [
      {
        reference: "John 15:16",
        verses: [
          {
            verse: 16,
            text: "You didn’t choose me, but I chose you and appointed you, that you should go and bear fruit, and that your fruit should remain; that whatever you will ask of the Father in my name, he may give it to you.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-10",
    reference: "John 16:23–27",
    theme: "Why we pray in Jesus’ name",
    explanation:
      "Jesus invites requests to the Father in his name and assures the disciples of the Father’s own love for them.",
    sourceUrl: "https://ebible.org/engwebp/JHN16.htm",
    segments: [
      {
        reference: "John 16:23–27",
        verses: [
          {
            verse: 23,
            text: "“In that day you will ask me no questions. Most certainly I tell you, whatever you may ask of the Father in my name, he will give it to you.",
          },
          {
            verse: 24,
            text: "Until now, you have asked nothing in my name. Ask, and you will receive, that your joy may be made full.",
          },
          {
            verse: 25,
            text: "“I have spoken these things to you in figures of speech. But the time is coming when I will no more speak to you in figures of speech, but will tell you plainly about the Father.",
          },
          {
            verse: 26,
            text: "In that day you will ask in my name; and I don’t say to you that I will pray to the Father for you,",
          },
          {
            verse: 27,
            text: "for the Father himself loves you, because you have loved me, and have believed that I came from God.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-11",
    reference: "1 John 5:14–15",
    theme: "Why we pray in Jesus’ name",
    explanation:
      "Confidence in prayer is tied to asking according to God’s will, not to a verbal formula that controls an outcome.",
    sourceUrl: "https://ebible.org/engwebp/1JN05.htm",
    segments: [
      {
        reference: "1 John 5:14–15",
        verses: [
          {
            verse: 14,
            text: "This is the boldness which we have toward him, that if we ask anything according to his will, he listens to us.",
          },
          {
            verse: 15,
            text: "And if we know that he listens to us, whatever we ask, we know that we have the petitions which we have asked of him.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-12",
    reference: "James 1:5",
    theme: "James: prayer, care, and honest motives",
    explanation:
      "Those lacking wisdom are invited to ask the generous God. Explain the invitation without shaming someone who is struggling.",
    sourceUrl: "https://ebible.org/engwebp/JAS01.htm",
    segments: [
      {
        reference: "James 1:5",
        verses: [
          {
            verse: 5,
            text: "But if any of you lacks wisdom, let him ask of God, who gives to all liberally and without reproach, and it will be given to him.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-13",
    reference: "James 4:3",
    theme: "James: prayer, care, and honest motives",
    explanation:
      "James challenges selfish motives in prayer. Do not turn this correction into a diagnosis of why any particular person remains ill or in distress.",
    sourceUrl: "https://ebible.org/engwebp/JAS04.htm",
    segments: [
      {
        reference: "James 4:3",
        verses: [
          {
            verse: 3,
            text: "You ask, and don’t receive, because you ask with wrong motives, so that you may spend it on your pleasures.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-14",
    reference: "James 5:13–16",
    theme: "James: prayer, care, and honest motives",
    explanation:
      "James connects suffering, praise, sick people seeking their elders’ prayer, confession, and praying for one another. Keep this community-care context.",
    sourceUrl: "https://ebible.org/engwebp/JAS05.htm",
    segments: [
      {
        reference: "James 5:13–16",
        verses: [
          {
            verse: 13,
            text: "Is any among you suffering? Let him pray. Is any cheerful? Let him sing praises.",
          },
          {
            verse: 14,
            text: "Is any among you sick? Let him call for the elders of the assembly, and let them pray over him, anointing him with oil in the name of the Lord;",
          },
          {
            verse: 15,
            text: "and the prayer of faith will heal him who is sick, and the Lord will raise him up. If he has committed sins, he will be forgiven.",
          },
          {
            verse: 16,
            text: "Confess your sins to one another and pray for one another, that you may be healed. The insistent prayer of a righteous person is powerfully effective.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-15",
    reference: "James 5:17–18",
    theme: "James: prayer, care, and honest motives",
    explanation:
      "Elijah is described as a person like us whose earnest prayers mattered. Prayer is not reserved for celebrities or an impressive public persona.",
    sourceUrl: "https://ebible.org/engwebp/JAS05.htm",
    segments: [
      {
        reference: "James 5:17–18",
        verses: [
          {
            verse: 17,
            text: "Elijah was a man with a nature like ours, and he prayed earnestly that it might not rain, and it didn’t rain on the earth for three years and six months.",
          },
          {
            verse: 18,
            text: "He prayed again, and the sky gave rain, and the earth produced its fruit.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-16",
    reference: "Ephesians 6:18–20",
    theme: "Paul: praying for one another",
    explanation:
      "Believers are urged to pray in the Spirit with perseverance for God’s people; Paul also asks for prayer for his own boldness.",
    sourceUrl: "https://ebible.org/engwebp/EPH06.htm",
    segments: [
      {
        reference: "Ephesians 6:18–20",
        verses: [
          {
            verse: 18,
            text: "with all prayer and requests, praying at all times in the Spirit, and being watchful to this end in all perseverance and requests for all the saints.",
          },
          {
            verse: 19,
            text: "Pray for me, that utterance may be given to me in opening my mouth, to make known with boldness the mystery of the Good News,",
          },
          {
            verse: 20,
            text: "for which I am an ambassador in chains; that in it I may speak boldly, as I ought to speak.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-17",
    reference: "Romans 15:30–32",
    theme: "Paul: praying for one another",
    explanation:
      "Paul asks believers to join him in prayer for protection, the reception of his service, and a visit according to God’s will.",
    sourceUrl: "https://ebible.org/engwebp/ROM15.htm",
    segments: [
      {
        reference: "Romans 15:30–32",
        verses: [
          {
            verse: 30,
            text: "Now I beg you, brothers, by our Lord Jesus Christ and by the love of the Spirit, that you strive together with me in your prayers to God for me,",
          },
          {
            verse: 31,
            text: "that I may be delivered from those who are disobedient in Judea, and that my service which I have for Jerusalem may be acceptable to the saints,",
          },
          {
            verse: 32,
            text: "that I may come to you in joy through the will of God, and together with you, find rest.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-18",
    reference: "1 Timothy 2:1–6",
    theme: "Paul: praying for one another",
    explanation:
      "Prayer and thanksgiving should include all people and rulers. The passage also identifies Christ Jesus as the mediator between God and humanity.",
    sourceUrl: "https://ebible.org/engwebp/1TI02.htm",
    segments: [
      {
        reference: "1 Timothy 2:1–6",
        verses: [
          {
            verse: 1,
            text: "I exhort therefore, first of all, that petitions, prayers, intercessions, and givings of thanks be made for all men,",
          },
          {
            verse: 2,
            text: "for kings and all who are in high places, that we may lead a tranquil and quiet life in all godliness and reverence.",
          },
          {
            verse: 3,
            text: "For this is good and acceptable in the sight of God our Savior,",
          },
          {
            verse: 4,
            text: "who desires all people to be saved and come to full knowledge of the truth.",
          },
          {
            verse: 5,
            text: "For there is one God and one mediator between God and men, the man Christ Jesus,",
          },
          {
            verse: 6,
            text: "who gave himself as a ransom for all, the testimony at the proper time,",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-19",
    reference: "1 Thessalonians 5:16–18",
    theme: "Paul: praying for one another",
    explanation:
      "Joy, continuing prayer, and thanksgiving belong together. Thanksgiving in hardship should not become pressure to call suffering good.",
    sourceUrl: "https://ebible.org/engwebp/1TH05.htm",
    segments: [
      {
        reference: "1 Thessalonians 5:16–18",
        verses: [
          {
            verse: 16,
            text: "Always rejoice.",
          },
          {
            verse: 17,
            text: "Pray without ceasing.",
          },
          {
            verse: 18,
            text: "In everything give thanks, for this is the will of God in Christ Jesus toward you.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-20",
    reference: "1 Thessalonians 5:25",
    theme: "Paul: praying for one another",
    explanation:
      "The letter simply asks the community to pray for its writers. Even leaders ask others for prayer.",
    sourceUrl: "https://ebible.org/engwebp/1TH05.htm",
    segments: [
      {
        reference: "1 Thessalonians 5:25",
        verses: [
          {
            verse: 25,
            text: "Brothers, pray for us.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-21",
    reference: "2 Thessalonians 3:1–2",
    theme: "Paul: praying for one another",
    explanation:
      "The writers ask for prayer for the spread of the Lord’s message and deliverance from harmful people.",
    sourceUrl: "https://ebible.org/engwebp/2TH03.htm",
    segments: [
      {
        reference: "2 Thessalonians 3:1–2",
        verses: [
          {
            verse: 1,
            text: "Finally, brothers, pray for us, that the word of the Lord may spread rapidly and be glorified, even as also with you,",
          },
          {
            verse: 2,
            text: "and that we may be delivered from unreasonable and evil men; for not all have faith.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-22",
    reference: "Philippians 1:3–11",
    theme: "Paul: praying for one another",
    explanation:
      "Paul gives thanks for the believers and prays for their love, discernment, and fruitful lives.",
    sourceUrl: "https://ebible.org/engwebp/PHP01.htm",
    segments: [
      {
        reference: "Philippians 1:3–11",
        verses: [
          {
            verse: 3,
            text: "I thank my God whenever I remember you,",
          },
          {
            verse: 4,
            text: "always in every request of mine on behalf of you all, making my requests with joy,",
          },
          {
            verse: 5,
            text: "for your partnership in furtherance of the Good News from the first day until now;",
          },
          {
            verse: 6,
            text: "being confident of this very thing, that he who began a good work in you will complete it until the day of Jesus Christ.",
          },
          {
            verse: 7,
            text: "It is even right for me to think this way on behalf of all of you, because I have you in my heart, because both in my bonds and in the defense and confirmation of the Good News, you all are partakers with me of grace.",
          },
          {
            verse: 8,
            text: "For God is my witness, how I long after all of you in the tender mercies of Christ Jesus.",
          },
          {
            verse: 9,
            text: "This I pray, that your love may abound yet more and more in knowledge and all discernment,",
          },
          {
            verse: 10,
            text: "so that you may approve the things that are excellent, that you may be sincere and without offense to the day of Christ,",
          },
          {
            verse: 11,
            text: "being filled with the fruits of righteousness which are through Jesus Christ, to the glory and praise of God.",
          },
        ],
      },
    ],
    notes: [
      {
        verse: 5,
        text: "The word translated “partnership” (κοινωνίᾳ) also means “fellowship” and “sharing”.",
      },
    ],
  },
  {
    id: "scripture-23",
    reference: "Philippians 4:6–7",
    theme: "Paul: praying for one another",
    explanation:
      "Bring requests to God with thanksgiving; the passage speaks of God’s peace guarding hearts and minds in Christ.",
    sourceUrl: "https://ebible.org/engwebp/PHP04.htm",
    segments: [
      {
        reference: "Philippians 4:6–7",
        verses: [
          {
            verse: 6,
            text: "In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.",
          },
          {
            verse: 7,
            text: "And the peace of God, which surpasses all understanding, will guard your hearts and your thoughts in Christ Jesus.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-24",
    reference: "Colossians 1:9–12",
    theme: "Paul: praying for one another",
    explanation:
      "Paul prays for knowledge of God’s will, wisdom, fruitful conduct, endurance, and gratitude—not only changed circumstances.",
    sourceUrl: "https://ebible.org/engwebp/COL01.htm",
    segments: [
      {
        reference: "Colossians 1:9–12",
        verses: [
          {
            verse: 9,
            text: "For this cause, we also, since the day we heard this, don’t cease praying and making requests for you, that you may be filled with the knowledge of his will in all spiritual wisdom and understanding,",
          },
          {
            verse: 10,
            text: "that you may walk worthily of the Lord, to please him in all respects, bearing fruit in every good work and increasing in the knowledge of God,",
          },
          {
            verse: 11,
            text: "strengthened with all power, according to the might of his glory, for all endurance and perseverance with joy,",
          },
          {
            verse: 12,
            text: "giving thanks to the Father, who made us fit to be partakers of the inheritance of the saints in light,",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-25",
    reference: "Colossians 4:2–4",
    theme: "Paul: praying for one another",
    explanation:
      "Remain devoted to prayer with watchfulness and thanksgiving, and pray for opportunities to communicate Christ’s message clearly.",
    sourceUrl: "https://ebible.org/engwebp/COL04.htm",
    segments: [
      {
        reference: "Colossians 4:2–4",
        verses: [
          {
            verse: 2,
            text: "Continue steadfastly in prayer, watching in it with thanksgiving,",
          },
          {
            verse: 3,
            text: "praying together for us also, that God may open to us a door for the word, to speak the mystery of Christ, for which I am also in bonds,",
          },
          {
            verse: 4,
            text: "that I may reveal it as I ought to speak.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-26",
    reference: "Colossians 4:12",
    theme: "Paul: praying for one another",
    explanation:
      "Epaphras is commended for persistent prayer for others’ maturity and faithfulness. Attribute this example to Epaphras, as reported by Paul.",
    sourceUrl: "https://ebible.org/engwebp/COL04.htm",
    segments: [
      {
        reference: "Colossians 4:12",
        verses: [
          {
            verse: 12,
            text: "Epaphras, who is one of you, a servant of Christ, salutes you, always striving for you in his prayers, that you may stand perfect and complete in all the will of God.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-27",
    reference: "2 Corinthians 1:3–11",
    theme: "Paul: praying for one another",
    explanation:
      "Comfort received from God is shared with others; the believers’ prayers contribute to a story that leads to thanksgiving.",
    sourceUrl: "https://ebible.org/engwebp/2CO01.htm",
    segments: [
      {
        reference: "2 Corinthians 1:3–11",
        verses: [
          {
            verse: 3,
            text: "Blessed be the God and Father of our Lord Jesus Christ, the Father of mercies and God of all comfort,",
          },
          {
            verse: 4,
            text: "who comforts us in all our affliction, that we may be able to comfort those who are in any affliction, through the comfort with which we ourselves are comforted by God.",
          },
          {
            verse: 5,
            text: "For as the sufferings of Christ abound to us, even so our comfort also abounds through Christ.",
          },
          {
            verse: 6,
            text: "But if we are afflicted, it is for your comfort and salvation. If we are comforted, it is for your comfort, which produces in you the patient enduring of the same sufferings which we also suffer.",
          },
          {
            verse: 7,
            text: "Our hope for you is steadfast, knowing that, since you are partakers of the sufferings, so you are also of the comfort.",
          },
          {
            verse: 8,
            text: "For we don’t desire to have you uninformed, brothers, concerning our affliction which happened to us in Asia: that we were weighed down exceedingly, beyond our power, so much that we despaired even of life.",
          },
          {
            verse: 9,
            text: "Yes, we ourselves have had the sentence of death within ourselves, that we should not trust in ourselves, but in God who raises the dead,",
          },
          {
            verse: 10,
            text: "who delivered us out of so great a death, and does deliver, on whom we have set our hope that he will also still deliver us,",
          },
          {
            verse: 11,
            text: "you also helping together on our behalf by your supplication; that, for the gift given to us by means of many, thanks may be given by many persons on your behalf.",
          },
        ],
      },
    ],
    notes: [
      {
        verse: 8,
        text: "The word for “brothers” here and where context allows may also be correctly translated “brothers and sisters” or “siblings.”",
      },
      {
        verse: 11,
        text: "+ MT: your; TR and NU: our",
      },
    ],
  },
  {
    id: "scripture-28",
    reference: "Matthew 6:5–13",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "Jesus rejects prayer performed for attention and teaches prayer to the Father. This supports sincere prayer rather than popularity metrics.",
    sourceUrl: "https://ebible.org/engwebp/MAT06.htm",
    segments: [
      {
        reference: "Matthew 6:5–13",
        verses: [
          {
            verse: 5,
            text: "“When you pray, you shall not be as the hypocrites, for they love to stand and pray in the synagogues and in the corners of the streets, that they may be seen by men. Most certainly, I tell you, they have received their reward.",
          },
          {
            verse: 6,
            text: "But you, when you pray, enter into your inner room, and having shut your door, pray to your Father who is in secret; and your Father who sees in secret will reward you openly.",
          },
          {
            verse: 7,
            text: "In praying, don’t use vain repetitions as the Gentiles do; for they think that they will be heard for their much speaking.",
          },
          {
            verse: 8,
            text: "Therefore don’t be like them, for your Father knows what things you need before you ask him.",
          },
          {
            verse: 9,
            text: "Pray like this: “ ‘Our Father in heaven, may your name be kept holy.",
          },
          {
            verse: 10,
            text: "Let your Kingdom come. Let your will be done on earth as it is in heaven.",
          },
          {
            verse: 11,
            text: "Give us today our daily bread.",
          },
          {
            verse: 12,
            text: "Forgive us our debts, as we also forgive our debtors.",
          },
          {
            verse: 13,
            text: "Bring us not into temptation, but deliver us from the evil one. For yours is the Kingdom, the power, and the glory forever. Amen.’",
          },
        ],
      },
    ],
    notes: [
      {
        verse: 13,
        text: "NU omits “For yours is the Kingdom, the power, and the glory forever. Amen.”",
      },
    ],
  },
  {
    id: "scripture-29",
    reference: "Matthew 5:44",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "Jesus teaches prayer even for persecutors. Encouragement should not become a place for hostility or retaliation.",
    sourceUrl: "https://ebible.org/engwebp/MAT05.htm",
    segments: [
      {
        reference: "Matthew 5:44",
        verses: [
          {
            verse: 44,
            text: "But I tell you, love your enemies, bless those who curse you, do good to those who hate you, and pray for those who mistreat you and persecute you,",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-30",
    reference: "Luke 11:1–13",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "Jesus teaches his disciples to pray and to ask, seek, and knock, emphasizing the Father’s generosity.",
    sourceUrl: "https://ebible.org/engwebp/LUK11.htm",
    segments: [
      {
        reference: "Luke 11:1–13",
        verses: [
          {
            verse: 1,
            text: "When he finished praying in a certain place, one of his disciples said to him, “Lord, teach us to pray, just as John also taught his disciples.”",
          },
          {
            verse: 2,
            text: "He said to them, “When you pray, say, ‘Our Father in heaven, may your name be kept holy. May your Kingdom come. May your will be done on earth, as it is in heaven.",
          },
          {
            verse: 3,
            text: "Give us day by day our daily bread.",
          },
          {
            verse: 4,
            text: "Forgive us our sins, for we ourselves also forgive everyone who is indebted to us. Bring us not into temptation, but deliver us from the evil one.’ ”",
          },
          {
            verse: 5,
            text: "He said to them, “Which of you, if you go to a friend at midnight and tell him, ‘Friend, lend me three loaves of bread,",
          },
          {
            verse: 6,
            text: "for a friend of mine has come to me from a journey, and I have nothing to set before him,’",
          },
          {
            verse: 7,
            text: "and he from within will answer and say, ‘Don’t bother me. The door is now shut, and my children are with me in bed. I can’t get up and give it to you’?",
          },
          {
            verse: 8,
            text: "I tell you, although he will not rise and give it to him because he is his friend, yet because of his persistence, he will get up and give him as many as he needs.",
          },
          {
            verse: 9,
            text: "“I tell you, keep asking, and it will be given you. Keep seeking, and you will find. Keep knocking, and it will be opened to you.",
          },
          {
            verse: 10,
            text: "For everyone who asks receives. He who seeks finds. To him who knocks it will be opened.",
          },
          {
            verse: 11,
            text: "“Which of you fathers, if your son asks for bread, will give him a stone? Or if he asks for a fish, he won’t give him a snake instead of a fish, will he?",
          },
          {
            verse: 12,
            text: "Or if he asks for an egg, he won’t give him a scorpion, will he?",
          },
          {
            verse: 13,
            text: "If you then, being evil, know how to give good gifts to your children, how much more will your heavenly Father give the Holy Spirit to those who ask him?”",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-31",
    reference: "Luke 18:1–8",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "The persistent widow illustrates continuing in prayer rather than losing heart. Do not portray God as morally equivalent to the unjust judge.",
    sourceUrl: "https://ebible.org/engwebp/LUK18.htm",
    segments: [
      {
        reference: "Luke 18:1–8",
        verses: [
          {
            verse: 1,
            text: "He also spoke a parable to them that they must always pray and not give up,",
          },
          {
            verse: 2,
            text: "saying, “There was a judge in a certain city who didn’t fear God and didn’t respect man.",
          },
          {
            verse: 3,
            text: "A widow was in that city, and she often came to him, saying, ‘Defend me from my adversary!’",
          },
          {
            verse: 4,
            text: "He wouldn’t for a while; but afterward he said to himself, ‘Though I neither fear God nor respect man,",
          },
          {
            verse: 5,
            text: "yet because this widow bothers me, I will defend her, or else she will wear me out by her continual coming.’ ”",
          },
          {
            verse: 6,
            text: "The Lord said, “Listen to what the unrighteous judge says.",
          },
          {
            verse: 7,
            text: "Won’t God avenge his chosen ones who are crying out to him day and night, and yet he exercises patience with them?",
          },
          {
            verse: 8,
            text: "I tell you that he will avenge them quickly. Nevertheless, when the Son of Man comes, will he find faith on the earth?”",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-32",
    reference: "Acts 1:14",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "The early community devotes itself to prayer together. Shared prayer predates any platform or creator audience.",
    sourceUrl: "https://ebible.org/engwebp/ACT01.htm",
    segments: [
      {
        reference: "Acts 1:14",
        verses: [
          {
            verse: 14,
            text: "All these with one accord continued steadfastly in prayer and supplication, along with the women and Mary the mother of Jesus, and with his brothers.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-33",
    reference: "Acts 12:5, 12",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "The church prays for Peter while he is imprisoned, and many gather to pray. Label the two selected verses separately rather than implying they are consecutive.",
    sourceUrl: "https://ebible.org/engwebp/ACT12.htm",
    segments: [
      {
        reference: "Acts 12:5",
        verses: [
          {
            verse: 5,
            text: "Peter therefore was kept in the prison, but constant prayer was made by the assembly to God for him.",
          },
        ],
      },
      {
        reference: "Acts 12:12",
        verses: [
          {
            verse: 12,
            text: "Thinking about that, he came to the house of Mary, the mother of John who was called Mark, where many were gathered together and were praying.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-34",
    reference: "John 17:20–23",
    theme: "Jesus’ teaching and the praying church",
    explanation:
      "Jesus prays for those who will believe through the disciples’ message and for their unity.",
    sourceUrl: "https://ebible.org/engwebp/JHN17.htm",
    segments: [
      {
        reference: "John 17:20–23",
        verses: [
          {
            verse: 20,
            text: "“Not for these only do I pray, but for those also who will believe in me through their word,",
          },
          {
            verse: 21,
            text: "that they may all be one; even as you, Father, are in me, and I in you, that they also may be one in us; that the world may believe that you sent me.",
          },
          {
            verse: 22,
            text: "The glory which you have given me, I have given to them, that they may be one, even as we are one,",
          },
          {
            verse: 23,
            text: "I in them, and you in me, that they may be perfected into one, that the world may know that you sent me and loved them, even as you loved me.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-35",
    reference: "Romans 8:26–27",
    theme: "When we are weak, while we wait, and when we give thanks",
    explanation:
      "The Spirit helps believers in weakness and intercedes when they do not know how to pray. Eloquence is not a prerequisite.",
    sourceUrl: "https://ebible.org/engwebp/ROM08.htm",
    segments: [
      {
        reference: "Romans 8:26–27",
        verses: [
          {
            verse: 26,
            text: "In the same way, the Spirit also helps our weaknesses, for we don’t know how to pray as we ought. But the Spirit himself makes intercession for us with groanings which can’t be uttered.",
          },
          {
            verse: 27,
            text: "He who searches the hearts knows what is on the Spirit’s mind, because he makes intercession for the saints according to God.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-36",
    reference: "Hebrews 4:14–16",
    theme: "When we are weak, while we wait, and when we give thanks",
    explanation:
      "Because of Jesus, the compassionate high priest, believers may approach God’s grace with confidence for mercy and help.",
    sourceUrl: "https://ebible.org/engwebp/HEB04.htm",
    segments: [
      {
        reference: "Hebrews 4:14–16",
        verses: [
          {
            verse: 14,
            text: "Having then a great high priest who has passed through the heavens, Jesus, the Son of God, let’s hold tightly to our confession.",
          },
          {
            verse: 15,
            text: "For we don’t have a high priest who can’t be touched with the feeling of our infirmities, but one who has been in all points tempted like we are, yet without sin.",
          },
          {
            verse: 16,
            text: "Let’s therefore draw near with boldness to the throne of grace, that we may receive mercy and may find grace for help in time of need.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-37",
    reference: "Luke 22:39–46",
    theme: "When we are weak, while we wait, and when we give thanks",
    explanation:
      "Jesus brings his anguish to the Father while submitting to the Father’s will. Honest grief and trust can coexist.",
    sourceUrl: "https://ebible.org/engwebp/LUK22.htm",
    segments: [
      {
        reference: "Luke 22:39–46",
        verses: [
          {
            verse: 39,
            text: "He came out and went, as his custom was, to the Mount of Olives. His disciples also followed him.",
          },
          {
            verse: 40,
            text: "When he was at the place, he said to them, “Pray that you don’t enter into temptation.”",
          },
          {
            verse: 41,
            text: "He was withdrawn from them about a stone’s throw, and he knelt down and prayed,",
          },
          {
            verse: 42,
            text: "saying, “Father, if you are willing, remove this cup from me. Nevertheless, not my will, but yours, be done.”",
          },
          {
            verse: 43,
            text: "An angel from heaven appeared to him, strengthening him.",
          },
          {
            verse: 44,
            text: "Being in agony, he prayed more earnestly. His sweat became like great drops of blood falling down on the ground.",
          },
          {
            verse: 45,
            text: "When he rose up from his prayer, he came to the disciples and found them sleeping because of grief,",
          },
          {
            verse: 46,
            text: "and said to them, “Why do you sleep? Rise and pray that you may not enter into temptation.”",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-38",
    reference: "2 Corinthians 12:7–10",
    theme: "When we are weak, while we wait, and when we give thanks",
    explanation:
      "Paul asks repeatedly for a burden to be removed and receives assurance of sufficient grace. Do not promise every prayer produces immediate relief.",
    sourceUrl: "https://ebible.org/engwebp/2CO12.htm",
    segments: [
      {
        reference: "2 Corinthians 12:7–10",
        verses: [
          {
            verse: 7,
            text: "By reason of the exceeding greatness of the revelations, that I should not be exalted excessively, a thorn in the flesh was given to me: a messenger of Satan to torment me, that I should not be exalted excessively.",
          },
          {
            verse: 8,
            text: "Concerning this thing, I begged the Lord three times that it might depart from me.",
          },
          {
            verse: 9,
            text: "He has said to me, “My grace is sufficient for you, for my power is made perfect in weakness.” Most gladly therefore I will rather glory in my weaknesses, that the power of Christ may rest on me.",
          },
          {
            verse: 10,
            text: "Therefore I take pleasure in weaknesses, in injuries, in necessities, in persecutions, and in distresses, for Christ’s sake. For when I am weak, then am I strong.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-39",
    reference: "1 Thessalonians 5:11",
    theme: "When we are weak, while we wait, and when we give thanks",
    explanation:
      "Encourage and build up one another. This grounds the supportive replies attached to requests and testimonies.",
    sourceUrl: "https://ebible.org/engwebp/1TH05.htm",
    segments: [
      {
        reference: "1 Thessalonians 5:11",
        verses: [
          {
            verse: 11,
            text: "Therefore exhort one another, and build each other up, even as you also do.",
          },
        ],
      },
    ],
    notes: [],
  },
  {
    id: "scripture-40",
    reference: "Psalm 66:16–20",
    theme: "When we are weak, while we wait, and when we give thanks",
    explanation:
      "The psalmist recounts God’s help and hearing of prayer. This offers language for gratitude and testimony without requiring every story to be resolved.",
    sourceUrl: "https://ebible.org/engwebp/PSA066.htm",
    segments: [
      {
        reference: "Psalm 66:16–20",
        verses: [
          {
            verse: 16,
            text: "Come and hear, all you who fear God. I will declare what he has done for my soul.",
          },
          {
            verse: 17,
            text: "I cried to him with my mouth. He was extolled with my tongue.",
          },
          {
            verse: 18,
            text: "If I cherished sin in my heart, the Lord wouldn’t have listened.",
          },
          {
            verse: 19,
            text: "But most certainly, God has listened. He has heard the voice of my prayer.",
          },
          {
            verse: 20,
            text: "Blessed be God, who has not turned away my prayer, nor his loving kindness from me.",
          },
        ],
      },
    ],
    notes: [],
  },
];

export const lordsPrayer: ScriptureQuotation = {
  reference: "Matthew 6:9–13",
  sourceUrl: "https://ebible.org/engwebp/MAT06.htm",
  segments: [
    {
      reference: "Matthew 6:9–13",
      verses: [
        {
          verse: 9,
          text: "Pray like this: “ ‘Our Father in heaven, may your name be kept holy.",
        },
        {
          verse: 10,
          text: "Let your Kingdom come. Let your will be done on earth as it is in heaven.",
        },
        {
          verse: 11,
          text: "Give us today our daily bread.",
        },
        {
          verse: 12,
          text: "Forgive us our debts, as we also forgive our debtors.",
        },
        {
          verse: 13,
          text: "Bring us not into temptation, but deliver us from the evil one. For yours is the Kingdom, the power, and the glory forever. Amen.’",
        },
      ],
    },
  ],
  notes: [
    {
      verse: 13,
      text: "NU omits “For yours is the Kingdom, the power, and the glory forever. Amen.”",
    },
  ],
};
