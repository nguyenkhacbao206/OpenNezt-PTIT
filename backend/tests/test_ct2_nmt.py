from app.providers.ct2_nmt import split_sentences, to_flores


def test_to_flores_known():
    assert to_flores("vi") == "vie_Latn"
    assert to_flores("EN") == "eng_Latn"


def test_to_flores_default():
    assert to_flores("xx") == "eng_Latn"
    assert to_flores("") == "eng_Latn"


def test_split_sentences_multi():
    assert split_sentences("Xin chào. Tôi khỏe! Bạn thì sao?") == [
        "Xin chào.",
        "Tôi khỏe!",
        "Bạn thì sao?",
    ]


def test_split_sentences_newlines_and_semicolon():
    assert split_sentences("A; B\nC") == ["A;", "B", "C"]


def test_split_sentences_empty():
    assert split_sentences("   ") == []


def test_split_sentences_no_delimiter():
    assert split_sentences("hello world") == ["hello world"]
