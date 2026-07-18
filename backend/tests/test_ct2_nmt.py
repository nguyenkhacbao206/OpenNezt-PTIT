from app.providers.ct2_nmt import to_flores


def test_to_flores_known():
    assert to_flores("vi") == "vie_Latn"
    assert to_flores("EN") == "eng_Latn"


def test_to_flores_default():
    assert to_flores("xx") == "eng_Latn"
    assert to_flores("") == "eng_Latn"
