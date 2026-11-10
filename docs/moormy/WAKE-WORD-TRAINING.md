# Training "Hey Moormy" (one time, about an hour)

> **On hold (10 Nov 2026).** The notebook itself says models it trains are
> "appropriate for non-commercial personal use only" because of its training
> data's licences. E-MOORM is commercial, so the owner chose no wake word for
> now: Moormy opens with a tap and the mic button. Kept for reference.

Moormy listens for "Hey Moormy" on the person's own device, with a small
openWakeWord model. That model has to be trained once for this phrase. The
training uses openWakeWord's own free Google Colab notebook: it makes
thousands of synthetic voices saying the phrase (and things that sound
close), and trains a small network on them. Nothing about E-MOORM or its
users goes into it.

## Steps

1. Open the notebook (sign in with any Google account):
   https://colab.research.google.com/drive/1q1oe2zOyZp7UsB3jJiQ1IFn8z5YfjwEb?usp=sharing
   (linked from https://github.com/dscripka/openWakeWord, "Training custom models").
2. Menu **Runtime → Change runtime type → T4 GPU** → Save.
3. Where the notebook asks for the wake word / target phrase, type:

       hey moormy

   If it lets you hear a test clip first, play it: the synthetic voice
   should say something close to "hey MOOR-mee". If it sounds wrong, try
   `hey moor me` instead (spelling by sound helps the voice generator).
4. **Runtime → Run all.** Leave the tab open; it takes under an hour.
5. At the end it offers the trained model for download. Download the files
   it makes (a `.onnx` file, and a `.tflite` if offered), named something like
   `hey_moormy.onnx`.
6. Put them in `docs/private/moormy-wakeword/` on this PC (create the folder)
   and tell me. I add them to the website in Phase 3, test how often it wakes
   by mistake, and tune the threshold.

## If something goes wrong

- "No GPU available": Colab's free GPUs run out at busy times; try again
  later, or run it on CPU (Runtime → Change runtime type → CPU), which takes
  several hours.
- A cell fails while downloading data: run that cell again.
- It finishes but the model wakes too easily or too rarely: that is tuned on
  our side (the threshold), no need to retrain at first.

## Licence: read before going live

From openWakeWord's README (checked 10 Nov 2026):

- Its **code** is Apache-2.0 (commercial use allowed).
- Its **included pre-trained models** are **CC BY-NC-SA 4.0: non-commercial**,
  "due to the inclusion of datasets with unknown or restrictive licensing
  as part of the training data".
- The shared **embedding model** came from Google (TFHub speech_embedding)
  under **Apache-2.0**; the melspectrogram step is an ONNX copy of a PyTorch
  function. These two are what a custom model runs on.
- It says **nothing about models you train yourself**. The notebook trains on
  synthetic voices (Piper TTS, whose voices each have their own licence) and
  on openWakeWord's prepared negative-example features, which come from
  datasets whose licences the README calls unknown or restrictive.

E-MOORM is commercial, so a custom "Hey Moormy" model may carry the same
non-commercial restriction. Training it and testing it privately is fine;
**before turning the wake word on for the public, the owner should decide
whether to accept that uncertainty, ask the author (an issue on the GitHub
repository), or keep only the mic button.** Everything else in Moormy (the
conversation, voice by tapping the mic, page awareness, actions) does not
depend on this.
