import pandas as pd

df = pd.read_csv("dataset/spotify.csv")
""" 
print("SHAPE:")
print(df.shape)

print("\nCOLUMNS:")
print(df.columns.tolist())

print("\nINFO:")
print(df.info())

print("\nNULLS:")
print(df.isnull().sum())

print("\nDUPLICATES:")
print(df.duplicated().sum())

print("\nUNIQUE GENRES:")
print(df["track_genre"].nunique())

print("\nSAMPLE:")
print(df.head()) """
print(df['track_id'].nunique())
print(len(df))